"""Isolated API regression: no plugin data/ or running backend is used."""
import base64
import hashlib
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'server'))
from app.api import apps as apps_api

spec = importlib.util.spec_from_file_location('jot_thumbnail_fixture', Path(__file__).parents[1] / 'server/main.py')
jot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jot)


@unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for image/video generation regression')
class ThumbnailsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.samples = tempfile.TemporaryDirectory(prefix='jot-thumbnail-samples-')
        image = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                                'testsrc2=size=1600x900:rate=1', '-frames:v', '1',
                                '-threads', '1', '-q:v', '2', '-f', 'image2pipe',
                                '-vcodec', 'mjpeg', 'pipe:1'], capture_output=True, check=True).stdout
        cls.image = image
        clip = Path(cls.samples.name) / 'clip.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=1280x720:rate=10', '-t', '1', '-threads', '1',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(clip)], check=True)
        cls.video = clip.read_bytes()
        cls.image_file = Path(cls.samples.name) / 'full.jpg'
        cls.image_file.write_bytes(image)
        cls.small = jot.thumb_mod.generate_thumbnail(cls.image_file, 'image')

    @classmethod
    def tearDownClass(cls):
        cls.samples.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jot-thumbnail-api-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.service = jot.Jot.__new__(jot.Jot)
        self.service.store = jot.store_mod.Store(self.root / 'data')
        self.service.media = jot.media_mod.MediaStore(self.root / 'data', jot.thumb_mod)
        app = FastAPI()
        app.include_router(apps_api.router, prefix='/api')
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.lookup = patch.object(apps_api, '_service_or_404', return_value=self.service)
        self.lookup.start()
        self.addCleanup(self.lookup.stop)

    def call(self, method, **args):
        response = self.client.post('/api/apps/anka-jot/call', json={'method': method, 'args': args})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['result']

    def upload(self, data, kind='image', thumb=None, att_id='att-1'):
        digest = hashlib.sha256(data).hexdigest()
        self.call('upload_begin', attId=att_id, kind=kind,
                  mime='image/jpeg' if kind == 'image' else 'video/mp4', size=len(data), sha256=digest)
        self.call('upload_chunk', attId=att_id, seq=0, b64=base64.b64encode(data).decode())
        result = self.call('upload_end', attId=att_id, thumbB64=thumb)
        att = {'id': att_id, 'noteId': 'note-1', 'kind': kind, 'sha256': digest,
               'serverPath': result['path'], 'thumbPath': result['thumbPath'], 'createdAt': 1}
        self.call('upsert_note', note={'id': 'note-1', 'text': '', 'rev': 0, 'tags': []}, atts=[att])
        return result, att

    def assert_cover(self, path):
        self.assertTrue(path)
        data = (self.root / path).read_bytes()
        self.assertTrue(jot.thumb_mod.valid_thumbnail(data))
        self.assertLess(len(data), len(self.image) // 2)
        return data

    def test_image_upload_generates_cover_and_snapshot_publishes_it(self):
        result, _ = self.upload(self.image)
        self.assert_cover(result['thumbPath'])
        snapshot = self.call('snapshot', sinceRev=0)
        self.assertEqual(snapshot['notes'][0]['atts'][0]['thumbPath'], result['thumbPath'])

    def test_video_upload_without_client_poster_generates_jpeg(self):
        result, _ = self.upload(self.video, 'video')
        self.assert_cover(result['thumbPath'])

    def test_very_short_video_retries_first_frame(self):
        clip = self.root / 'short.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=640x360:rate=10', '-t', '0.05', '-threads', '1',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(clip)], check=True)
        result, _ = self.upload(clip.read_bytes(), 'video')
        self.assert_cover(result['thumbPath'])

    def test_force_repair_replaces_corrupted_content_addressed_file(self):
        result, att = self.upload(self.image)
        (self.root / result['thumbPath']).write_bytes(b'broken')
        repair = self.call('ensure_thumbnail', attId=att['id'], force=True)
        self.assert_cover(repair['thumbPath'])

    def test_client_cover_works_without_ffmpeg(self):
        with patch.object(jot.thumb_mod.shutil, 'which', return_value=None):
            result, _ = self.upload(self.image, thumb=base64.b64encode(self.small).decode())
            self.assert_cover(result['thumbPath'])

    def test_deduplicated_upload_returns_or_repairs_cover(self):
        result, att = self.upload(self.image)
        (self.root / result['thumbPath']).unlink()
        with patch.object(jot.thumb_mod.shutil, 'which', return_value=None):
            dedup = self.call('upload_begin', attId='att-2', kind='image', mime='image/jpeg',
                              size=len(self.image), sha256=att['sha256'],
                              thumbB64=base64.b64encode(self.small).decode())
        self.assertTrue(dedup['exists'])
        self.assert_cover(dedup['thumbPath'])

    def test_legacy_broken_cover_repair_updates_rev_only_once(self):
        result, att = self.upload(self.image)
        (self.root / result['thumbPath']).unlink()
        bad = self.root / result['path'].replace('.jpg', '.thumb.jpg')
        bad.write_bytes(b'not-an-image')
        self.service.store.set_att_media(att['id'], result['path'], bad.relative_to(self.root).as_posix())
        before = self.service.store.get_note('note-1')['rev']
        repair = self.call('ensure_thumbnail', attId=att['id'], force=True)
        self.assert_cover(repair['thumbPath'])
        delta = self.call('snapshot', sinceRev=before)
        self.assertEqual(delta['notes'][0]['atts'][0]['thumbPath'], repair['thumbPath'])
        after = self.service.store.get_note('note-1')['rev']
        self.call('ensure_thumbnail', attId=att['id'])
        self.assertEqual(self.service.store.get_note('note-1')['rev'], after)

    def test_missing_decoder_preserves_original_then_accepts_client_repair(self):
        with patch.object(jot.thumb_mod.shutil, 'which', return_value=None):
            result, att = self.upload(self.image)
            self.assertTrue((self.root / result['path']).is_file())
            self.assertIsNone(result['thumbPath'])
            error = self.client.post('/api/apps/anka-jot/call', json={
                'method': 'ensure_thumbnail', 'args': {'attId': att['id']}})
            self.assertEqual(error.status_code, 400)
            repaired = self.call('ensure_thumbnail', attId=att['id'],
                                 thumbB64=base64.b64encode(self.small).decode())
            self.assert_cover(repaired['thumbPath'])

    def test_invalid_cover_is_regenerated_and_escape_path_rejected(self):
        result, _ = self.upload(self.image, thumb=base64.b64encode(b'invalid').decode())
        self.assert_cover(result['thumbPath'])
        with self.assertRaises(ValueError):
            self.service.media.ensure_thumbnail('../outside.mp4', 'video')


if __name__ == '__main__':
    unittest.main()
