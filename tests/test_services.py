"""API contract tests with mocked models/LLM; no live credentials or inference."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'sql-agent'))

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class SQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, {'APP_ENV': 'production', 'INTERNAL_API_KEY': 'test-key'}):
            cls.module = load('sql_interface', 'sql-agent/interface.py')
        cls.client = cls.module.app.test_client()

    def test_authorization_and_language_contract(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.client.post('/ask', json={'question': 'test'}).status_code, 401)
        with patch.object(self.module, 'get_agent', return_value=object()), patch.object(self.module, 'ask_question', return_value='Answer') as ask:
            response = self.client.post('/ask', headers={'X-Service-Key': 'test-key'}, json={'question': 'City status?', 'language': 'hindi'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['result']['content'], 'Answer')
            self.assertIn('Hindi', ask.call_args.args[0])

    def test_unavailable_and_validation(self):
        with patch.object(self.module, 'get_agent', return_value=None):
            self.assertEqual(self.client.get('/ready').status_code, 503)
            self.assertEqual(self.client.post('/ask', headers={'X-Service-Key': 'test-key'}, json={'question': 'Hello'}).status_code, 503)
        self.assertEqual(self.client.post('/ask', headers={'X-Service-Key': 'test-key'}, json={'question': ['invalid']}).status_code, 400)

    def test_database_url_and_access_configuration(self):
        import SQLAgent
        callbacks = {}
        def register(engine, event_name):
            def decorate(callback):
                callbacks[event_name] = callback
                return callback
            return decorate
        with patch.dict(os.environ, {'DATABASE_URL': 'postgres://reader:fake@localhost/db?sslmode=require&schema=public'}), patch.object(SQLAgent, 'create_engine') as create, patch.object(SQLAgent, 'SQLDatabase') as database, patch.object(SQLAgent.event, 'listens_for', side_effect=register):
            SQLAgent.load_database()
            parsed = create.call_args.args[0]
            self.assertEqual(parsed.drivername, 'postgresql')
            self.assertNotIn('schema', parsed.query)
            self.assertEqual(parsed.query['sslmode'], 'require')
            self.assertNotIn('options', create.call_args.kwargs['connect_args'])
            connection = MagicMock()
            callbacks['begin'](connection)
            self.assertEqual([call.args[0] for call in connection.exec_driver_sql.call_args_list],
                ['SET TRANSACTION READ ONLY', "SET LOCAL statement_timeout = '15s'"])
            connection.exec_driver_sql.side_effect = RuntimeError('cannot enforce read-only')
            with self.assertRaisesRegex(RuntimeError, 'cannot enforce read-only'):
                callbacks['begin'](connection)
            self.assertNotIn('User', database.call_args.kwargs['include_tables'])
            self.assertEqual(database.call_args.kwargs['sample_rows_in_table_info'], 0)

    def test_groq_model_default_and_override(self):
        import SQLAgent
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'}, clear=True), patch.object(SQLAgent, 'ChatGroq') as model:
            SQLAgent.load_model()
            self.assertEqual(model.call_args.kwargs['model'], 'openai/gpt-oss-120b')
            os.environ['GROQ_MODEL'] = 'configured-model'
            SQLAgent.load_model()
            self.assertEqual(model.call_args.kwargs['model'], 'configured-model')

class ModelTests(unittest.TestCase):
    def test_explicit_onnx_artifact_requires_matching_checksum(self):
        import hashlib
        module = load('prepare_onnx', 'microservices/prepare_models.py')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pothole.onnx'
            payload = b'test-artifact' * 200
            path.write_bytes(payload)
            with patch.dict(os.environ, {'MODEL_PATH': str(path)}, clear=True):
                with self.assertRaisesRegex(RuntimeError, 'require POTHOLE_MODEL_SHA256'):
                    module.prepare('pothole')
                os.environ['POTHOLE_MODEL_SHA256'] = hashlib.sha256(payload).hexdigest()
                self.assertTrue(module.prepare('pothole'))
                path.write_bytes(b'changed-artifact' * 200)
                with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                    module.prepare('pothole')

    def test_missing_weights_and_checksum(self):
        module = load('prepare_models', 'microservices/prepare_models.py')
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'ROOT', Path(directory)), patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'weights missing'):
                module.prepare('pothole')
            path = Path(directory) / 'bad.pt'
            path.write_bytes(b'bad weights')
            with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                module.verify(path, '0' * 64)

    def test_model_api_readiness_authentication_and_invalid_image(self):
        from fastapi.testclient import TestClient
        fake_yolo = MagicMock()
        fake_yolo.YOLO.side_effect = RuntimeError('weights unavailable in test')
        fake_cv2 = MagicMock()
        with patch.dict(sys.modules, {'torch': MagicMock(), 'cv2': fake_cv2, 'ultralytics': fake_yolo}), patch.dict(os.environ, {'APP_ENV': 'production', 'INTERNAL_API_KEY': 'test-key'}):
            module = load('ai_app', 'microservices/app.py')
            client = TestClient(module.app)
            self.assertEqual(client.get('/health').status_code, 200)
            self.assertEqual(client.get('/ready').status_code, 503)
            self.assertEqual(client.post('/detect').status_code, 401)
            headers = {'X-Service-Key': 'test-key'}
            self.assertEqual(client.post('/detect', headers=headers, files={'file': ('image.jpg', b'bad', 'image/jpeg')}).status_code, 503)
            module.model = MagicMock()
            fake_cv2.imdecode.return_value = None
            self.assertEqual(client.post('/detect', headers=headers, files={'file': ('image.jpg', b'bad', 'image/jpeg')}).status_code, 400)
            import numpy as np
            fake_cv2.Laplacian.return_value.var.return_value = np.float64(0)
            sharpness, blurry = module.check_image_sharpness(np.zeros((2, 2)))
            self.assertIs(type(blurry), bool)
            self.assertEqual(sharpness, 0.0)

if __name__ == '__main__':
    unittest.main()
