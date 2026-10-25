"""JSON-lines API fixture backed by a temporary SQLite store, never plugin data/."""
import importlib.util
import json
import sys
import tempfile
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location('jot_fixture_store', Path(__file__).parents[1] / 'server/store.py')
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
with tempfile.TemporaryDirectory(prefix='jot-interactions-') as folder:
    store = S.Store(Path(folder))
    for i in range(32):
        store.upsert_note({'id': f'fixture-{i:02}', 'title': f'交互回归 {i:02}',
            'text': '共享正文\n' + '\n'.join(f'内容第 {j} 行' for j in range(12)),
            'createdAt': time.time() * 1000 - i * 60000, 'updatedAt': time.time() * 1000,
            'tags': ['测试'], 'source': 'text', 'pinned': False, 'fav': True, 'todo': True,
            'todos': [{'id': f'todo-{i}', 'text': f'完成任务 {i:02}', 'done': False}],
            'color': None, 'location': None, 'deleted': False, 'rev': 0}, [])
    for line in sys.stdin:
        try:
            request = json.loads(line)
            method, args = request['method'], request.get('args', {})
            if method == 'upsert_note':
                note, applied = store.upsert_note(args['note'], args.get('atts'), base=args.get('base'), mutation_id=args.get('mutationId'))
                result = {'conflicts': note.pop('_conflicts', []), 'note': note, 'applied': applied, 'serverRev': note['rev']}
            elif method == 'snapshot':
                result = store.snapshot(args.get('sinceRev', 0), args.get('limit', 500))
            elif method == 'stats':
                result = {'serverRev': store.server_rev()}
            elif method == 'get_note':
                result = store.get_note(args['id'])
            elif method == 'note_history':
                result = store.note_history(args['id'])
            elif method == 'upsert_tag':
                store.upsert_tag(args['name'], args.get('color'), args.get('pinned'))
                result = {'ok': True}
            elif method == 'delete_note':
                result = {'deleted': store.delete_note(args['id'])}
            else:
                raise ValueError('Unsupported fixture method: ' + method)
            print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps({'ok': False, 'error': str(error)}), flush=True)
