#!/usr/bin/env python3
"""
Crypto Playground Web Interface
Веб-интерфейс для управления crypto-playground
"""

import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

# Убираем Socket.IO для упрощения
import threading
import time
import requests
import re
from concurrent.futures import ThreadPoolExecutor, as_completed


BASE_DIR = Path(__file__).resolve().parent

# Определяем путь к исходному проекту crypto-playground
_default_project_candidates = [
    Path(os.environ.get('CRYPTO_PLAYGROUND_PATH', '/workspace/crypto-playground')),
    BASE_DIR.parent / 'crypto-playground',
    BASE_DIR,
]

for candidate in _default_project_candidates:
    if candidate.exists():
        CRYPTO_PLAYGROUND_PATH = str(candidate.resolve())
        break
else:
    CRYPTO_PLAYGROUND_PATH = str(BASE_DIR)

if CRYPTO_PLAYGROUND_PATH not in sys.path:
    sys.path.append(CRYPTO_PLAYGROUND_PATH)

# Общая директория для файлов проекта
FILES_PATH = os.environ.get('CRYPTO_PLAYGROUND_FILES', os.path.join(CRYPTO_PLAYGROUND_PATH, 'files'))
os.makedirs(FILES_PATH, exist_ok=True)

# Поддиректории для аккаунтов и прокси
ACCOUNTS_DIR = os.path.join(FILES_PATH, 'accounts')
PROXIES_DIR = os.path.join(FILES_PATH, 'proxies')
os.makedirs(ACCOUNTS_DIR, exist_ok=True)
os.makedirs(PROXIES_DIR, exist_ok=True)

ALLOWED_ACCOUNT_EXTENSIONS = {'.tsv', '.txt', '.csv'}


def _normalize_account_filename(filename: str) -> str:
    """Возвращает безопасное имя файла с допустимым расширением"""
    if not filename:
        raise ValueError('Имя файла не может быть пустым')

    base_name = os.path.basename(filename).strip()
    if not base_name:
        raise ValueError('Имя файла не может быть пустым')

    name, ext = os.path.splitext(base_name)
    if not ext:
        ext = '.tsv'

    ext = ext.lower()
    if ext not in ALLOWED_ACCOUNT_EXTENSIONS:
        ext = '.tsv'

    safe_name = secure_filename(f"{name}{ext}")
    if not safe_name:
        raise ValueError('Некорректное имя файла')

    return safe_name


def get_account_file_path(filename: str) -> str:
    """Возвращает полный путь к файлу аккаунтов"""
    safe_name = _normalize_account_filename(filename)
    return os.path.join(ACCOUNTS_DIR, safe_name)


def count_records_from_text(text: str) -> int:
    """Подсчитывает количество непустых строк"""
    return sum(1 for line in text.split('\n') if line.strip())


def count_records_in_file(file_path: str, limit: int = 200000) -> int:
    """Считает количество строк в файле с учетом лимита"""
    count = 0
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as file_obj:
            for index, line in enumerate(file_obj):
                if line.strip():
                    count += 1
                if limit and index >= limit:
                    break
    except FileNotFoundError:
        return 0
    return count


app = Flask(__name__)
app.config['SECRET_KEY'] = 'crypto-playground-secret-key'

class ProcessManager:
    """Менеджер процессов для запуска команд crypto-playground"""

    def __init__(self):
        self.processes = {}
        self.logs = {}
        self.metadata = {}
        self.lock = threading.Lock()
        self.max_logs = 1000

    def start_process(self, command_id, command, cwd=CRYPTO_PLAYGROUND_PATH):
        """Запуск процесса"""
        try:
            print(f"Starting process {command_id}: {command}")
            print(f"Working directory: {cwd}")

            # Проверяем существование рабочей директории
            if not os.path.exists(cwd):
                print(f"Working directory does not exist: {cwd}")
                return False, f"Working directory does not exist: {cwd}"

            process = subprocess.Popen(
                command,
                shell=True,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )

            with self.lock:
                self.processes[command_id] = process
                self.logs[command_id] = []
                self.metadata[command_id] = {
                    'command_id': command_id,
                    'command': command,
                    'cwd': os.path.abspath(cwd) if cwd else None,
                    'status': 'running',
                    'pid': process.pid,
                    'started_at': datetime.utcnow().isoformat(),
                    'finished_at': None,
                    'exit_code': None,
                }

            print(f"Process {command_id} started with PID: {process.pid}")

            # Запускаем поток для чтения логов
            thread = threading.Thread(
                target=self._read_output,
                args=(command_id, process)
            )
            thread.daemon = True
            thread.start()
            
            return True
        except Exception as e:
            print(f"Error starting process {command_id}: {str(e)}")
            return False, str(e)
    
    def _read_output(self, command_id, process):
        """Чтение вывода процесса"""
        print(f"Starting to read output for process {command_id}")
        try:
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    print(f"Process {command_id} finished reading output")
                    break
                if output:
                    log_entry = {
                        'timestamp': datetime.utcnow().isoformat(),
                        'message': output.strip()
                    }
                    with self.lock:
                        logs = self.logs.setdefault(command_id, [])
                        logs.append(log_entry)
                        if len(logs) > self.max_logs:
                            # Храним только последние записи, чтобы не расходовать память
                            del logs[:-self.max_logs]
                    print(f"Log from {command_id}: {output.strip()}")

                    # Отправляем лог через WebSocket (отключено - используем HTTP polling)
                    # socketio.emit('log_update', {
                    #     'command_id': command_id,
                    #     'log': log_entry
                    # })
        except Exception as e:
            print(f"Error reading output for {command_id}: {str(e)}")

        # Процесс завершен
        exit_code = process.poll()
        finished_at = datetime.utcnow().isoformat()
        with self.lock:
            meta = self.metadata.get(command_id)
            if meta:
                meta['exit_code'] = exit_code
                meta['finished_at'] = finished_at
                if meta.get('status') != 'stopped':
                    meta['status'] = 'finished' if exit_code == 0 else 'failed'
            # После завершения удаляем объект процесса, чтобы освободить ресурсы
            self.processes.pop(command_id, None)
        print(f"Process {command_id} finished with exit code: {exit_code}")
        # socketio.emit('process_finished', {
        #     'command_id': command_id,
        #     'exit_code': exit_code
        # })

    def stop_process(self, command_id):
        """Остановка процесса"""
        with self.lock:
            process = self.processes.get(command_id)
        if process:
            process.terminate()
            with self.lock:
                meta = self.metadata.get(command_id)
                if meta:
                    meta['status'] = 'stopped'
                    meta['finished_at'] = datetime.utcnow().isoformat()
            return True
        return False

    def get_process_status(self, command_id):
        """Получение статуса процесса"""
        with self.lock:
            process = self.processes.get(command_id)
            if process and process.poll() is None:
                return 'running'
            meta = self.metadata.get(command_id)
        if meta:
            return meta.get('status', 'finished')
        return 'not_found'

    def get_logs(self, command_id):
        """Получение логов процесса"""
        with self.lock:
            return list(self.logs.get(command_id, []))

    def get_process_details(self, command_id):
        """Возвращает метаданные и логи выбранного процесса"""
        with self.lock:
            meta = self.metadata.get(command_id)
            if not meta:
                return None
            details = dict(meta)
            details['logs'] = list(self.logs.get(command_id, []))
        return details

    def get_processes_summary(self):
        """Сводная информация обо всех процессах"""
        with self.lock:
            summary = [dict(meta) for meta in self.metadata.values()]
        summary.sort(key=lambda item: item.get('started_at') or '', reverse=True)
        return summary

    def clear_process(self, command_id):
        """Удаляет информацию о процессе и его логах"""
        removed = False
        with self.lock:
            process = self.processes.pop(command_id, None)
            if process and process.poll() is None:
                process.terminate()
            if command_id in self.logs:
                removed = True
                self.logs.pop(command_id, None)
            if command_id in self.metadata:
                removed = True
                self.metadata.pop(command_id, None)
        return removed

# Глобальные переменные для отслеживания прогресса (как в рабочем проекте)
testing_progress = {
    'is_running': False,
    'current': 0,
    'total': 0,
    'working': 0,
    'failed': 0,
    'unique_ips': 0
}

# Флаг для остановки тестирования
stop_testing = False

# Словарь для хранения исходных форматов прокси
original_formats = {}

# Глобальные переменные для хранения результатов
current_working_proxies = []
current_unique_proxies = []
last_exported_filename = None

def parse_proxy_format(proxy_string):
    """
    Парсит различные форматы прокси и возвращает стандартный формат для requests
    Поддерживаемые форматы:
    1. http://login:password@domain:port (текущий)
    2. domain:port:username:password
    3. domain:port@username:password
    4. username:password:domain:port
    5. username:password@domain:port
    """
    proxy_string = proxy_string.strip()
    
    # Формат 1: http://login:password@domain:port
    if proxy_string.startswith('http://') or proxy_string.startswith('https://'):
        return proxy_string, proxy_string
    
    # Формат 2: domain:port:username:password
    pattern2 = r'^([^:]+):(\d+):([^:]+):(.+)$'
    match2 = re.match(pattern2, proxy_string)
    if match2:
        domain, port, username, password = match2.groups()
        standard_format = f"http://{username}:{password}@{domain}:{port}"
        return standard_format, proxy_string
    
    # Формат 3: domain:port@username:password
    pattern3 = r'^([^:]+):(\d+)@([^:]+):(.+)$'
    match3 = re.match(pattern3, proxy_string)
    if match3:
        domain, port, username, password = match3.groups()
        standard_format = f"http://{username}:{password}@{domain}:{port}"
        return standard_format, proxy_string
    
    # Формат 4: username:password:domain:port
    pattern4 = r'^([^:]+):([^:]+):([^:]+):(\d+)$'
    match4 = re.match(pattern4, proxy_string)
    if match4:
        username, password, domain, port = match4.groups()
        standard_format = f"http://{username}:{password}@{domain}:{port}"
        return standard_format, proxy_string
    
    # Формат 5: username:password@domain:port
    pattern5 = r'^([^:]+):([^:]+)@([^:]+):(\d+)$'
    match5 = re.match(pattern5, proxy_string)
    if match5:
        username, password, domain, port = match5.groups()
        standard_format = f"http://{username}:{password}@{domain}:{port}"
        return standard_format, proxy_string
    
    # Если формат не распознан, возвращаем как есть
    return proxy_string, proxy_string

def test_single_proxy(proxy, timeout=10):
    """Тестирует один прокси"""
    try:
        proxy_dict = {
            'http': proxy,
            'https': proxy
        }
        
        response = requests.get(
            'http://httpbin.org/ip',
            proxies=proxy_dict,
            timeout=timeout,
            headers={'User-Agent': 'ProxyTester/1.0'}
        )
        
        if response.status_code == 200:
            ip_data = response.json()
            return True, ip_data.get('origin', 'unknown')
        return False, None
        
    except Exception:
        return False, None

def run_proxy_test(proxy_list):
    """Запускает тестирование прокси в отдельном потоке с многопоточностью"""
    global testing_progress, stop_testing, original_formats, current_working_proxies, current_unique_proxies, last_exported_filename

    print(f"Starting proxy testing with {len(proxy_list)} proxies")

    testing_progress['is_running'] = True
    testing_progress['current'] = 0
    testing_progress['working'] = 0
    testing_progress['failed'] = 0
    testing_progress['unique_ips'] = 0
    stop_testing = False
    last_exported_filename = None

    # Парсим прокси в разных форматах
    proxies = []
    original_formats.clear()  # Очищаем предыдущие данные
    current_working_proxies = []
    current_unique_proxies = []
    for raw_proxy in proxy_list:
        standard_format, original_format = parse_proxy_format(raw_proxy)
        proxies.append(standard_format)
        original_formats[standard_format] = original_format
    
    testing_progress['total'] = len(proxies)
    
    working_proxies = []
    unique_ips = set()
    unique_proxies = []
    lock = threading.Lock()
    
    # Настройки многопоточности (как в консольной версии)
    max_threads = 50
    
    # Многопоточное тестирование
    with ThreadPoolExecutor(max_workers=max_threads) as executor:
        # Отправляем задачи
        future_to_proxy = {executor.submit(test_single_proxy, proxy): proxy for proxy in proxies}
        
        # Обрабатываем результаты по мере готовности
        for future in as_completed(future_to_proxy):
            if stop_testing or not testing_progress['is_running']:
                # Отменяем оставшиеся задачи
                for f in future_to_proxy:
                    f.cancel()
                break
                
            proxy = future_to_proxy[future]
            
            try:
                is_working, ip = future.result()
                
                with lock:
                    testing_progress['current'] += 1
                    
                    if is_working:
                        testing_progress['working'] += 1
                        working_proxies.append(proxy)
                        print(f"Working proxy found: {proxy} -> {ip}")
                        
                        if ip and ip not in unique_ips:
                            unique_ips.add(ip)
                            unique_proxies.append(proxy)
                            testing_progress['unique_ips'] = len(unique_ips)
                    else:
                        testing_progress['failed'] += 1
                        
            except Exception as e:
                print(f"Error processing proxy result: {e}")
                with lock:
                    testing_progress['current'] += 1
                    testing_progress['failed'] += 1
    
    print(f"Testing completed. Working: {len(working_proxies)}, Unique: {len(unique_proxies)}")
    
    # Сохраняем результаты в глобальные переменные для доступа через API
    current_working_proxies = [original_formats.get(p, p) for p in working_proxies]
    current_unique_proxies = [original_formats.get(p, p) for p in unique_proxies]
    
    testing_progress['is_running'] = False
    stop_testing = False

class WebProxyTester:
    """Заглушка для совместимости"""
    def __init__(self):
        pass

process_manager = ProcessManager()
proxy_tester = WebProxyTester()

@app.route('/')
def index():
    """Главная страница"""
    return render_template('index.html')

@app.route('/accounts')
def accounts():
    """Страница управления аккаунтами"""
    return render_template('accounts.html')

@app.route('/modules')
def modules():
    """Страница модулей"""
    return render_template('modules.html')

@app.route('/logs')
def logs():
    """Страница логов"""
    return render_template('logs.html')

@app.route('/proxies')
def proxies():
    """Страница тестирования прокси"""
    return render_template('proxies.html')

@app.route('/test')
def test():
    """Тестовая страница для отладки боковой панели"""
    return '''
<!DOCTYPE html>
<html>
<head>
    <title>Test Sidebar</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #212121; color: white; }
        .container { display: flex; height: 100vh; }
        .sidebar { 
            width: 260px; 
            background: red; 
            border: 10px solid yellow;
            display: flex;
            flex-direction: column;
            padding: 20px;
        }
        .content { flex: 1; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h2>SIDEBAR TEST</h2>
            <p>This should be visible!</p>
        </div>
        <div class="content">
            <h1>Main Content</h1>
            <p>This is the main content area.</p>
        </div>
    </div>
</body>
</html>
    '''



@app.route('/api/files')
def api_files():
    """API для получения списка файлов"""
    try:
        files = []
        if os.path.exists(FILES_PATH):
            for file in os.listdir(FILES_PATH):
                if file.endswith('.tsv'):
                    file_path = os.path.join(FILES_PATH, file)
                    stat = os.stat(file_path)
                    files.append({
                        'name': file,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/file/<filename>')
def api_file_content(filename):
    """API для получения содержимого файла"""
    try:
        file_path = os.path.join(FILES_PATH, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        return jsonify({'content': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/files')
def api_accounts_files():
    """Возвращает список файлов с аккаунтами"""
    try:
        files = []
        if os.path.exists(ACCOUNTS_DIR):
            for filename in sorted(os.listdir(ACCOUNTS_DIR)):
                file_path = os.path.join(ACCOUNTS_DIR, filename)
                if not os.path.isfile(file_path):
                    continue
                stat = os.stat(file_path)
                files.append({
                    'name': filename,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'records': count_records_in_file(file_path)
                })
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/files', methods=['POST'])
def api_accounts_create_file():
    """Создает новый файл аккаунтов"""
    try:
        data = request.json or {}
        filename = data.get('filename', '').strip()
        content = data.get('content', '')
        overwrite = data.get('overwrite', False)

        safe_name = _normalize_account_filename(filename)
        file_path = os.path.join(ACCOUNTS_DIR, safe_name)

        if os.path.exists(file_path) and not overwrite:
            return jsonify({'error': 'Файл с таким именем уже существует', 'filename': safe_name}), 400

        with open(file_path, 'w', encoding='utf-8') as file_obj:
            file_obj.write(content or '')

        records = count_records_from_text(content or '')
        return jsonify({
            'success': True,
            'filename': safe_name,
            'records': records
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/files/<path:filename>', methods=['GET'])
def api_accounts_file_content(filename):
    """Возвращает содержимое файла аккаунтов"""
    try:
        safe_name = _normalize_account_filename(filename)
        file_path = os.path.join(ACCOUNTS_DIR, safe_name)

        if not os.path.exists(file_path):
            return jsonify({'error': 'Файл не найден'}), 404

        with open(file_path, 'r', encoding='utf-8') as file_obj:
            content = file_obj.read()

        return jsonify({
            'filename': safe_name,
            'content': content,
            'records': count_records_from_text(content)
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/files/<path:filename>', methods=['PUT'])
def api_accounts_update_file(filename):
    """Обновляет содержимое файла аккаунтов"""
    try:
        data = request.json or {}
        content = data.get('content', '')

        safe_name = _normalize_account_filename(filename)
        file_path = os.path.join(ACCOUNTS_DIR, safe_name)

        if not os.path.exists(file_path):
            return jsonify({'error': 'Файл не найден'}), 404

        with open(file_path, 'w', encoding='utf-8') as file_obj:
            file_obj.write(content or '')

        records = count_records_from_text(content or '')
        return jsonify({
            'success': True,
            'filename': safe_name,
            'records': records
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/files/<path:filename>', methods=['DELETE'])
def api_accounts_delete_file(filename):
    """Удаляет файл аккаунтов"""
    try:
        safe_name = _normalize_account_filename(filename)
        file_path = os.path.join(ACCOUNTS_DIR, safe_name)

        if not os.path.exists(file_path):
            return jsonify({'error': 'Файл не найден'}), 404

        os.remove(file_path)

        return jsonify({'success': True, 'filename': safe_name})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/files/<path:filename>/rename', methods=['POST'])
def api_accounts_rename_file(filename):
    """Переименовывает файл аккаунтов"""
    try:
        data = request.json or {}
        new_name = data.get('filename', '').strip()
        if not new_name:
            return jsonify({'error': 'Новое имя файла не указано'}), 400

        old_safe_name = _normalize_account_filename(filename)
        new_safe_name = _normalize_account_filename(new_name)

        old_path = os.path.join(ACCOUNTS_DIR, old_safe_name)
        new_path = os.path.join(ACCOUNTS_DIR, new_safe_name)

        if not os.path.exists(old_path):
            return jsonify({'error': 'Исходный файл не найден'}), 404

        if os.path.exists(new_path):
            return jsonify({'error': 'Файл с таким именем уже существует'}), 400

        os.rename(old_path, new_path)

        return jsonify({
            'success': True,
            'old_filename': old_safe_name,
            'filename': new_safe_name
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/upload', methods=['POST'])
def api_accounts_upload():
    """Загрузка файла аккаунтов через multipart форму"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'Файл не найден в запросе'}), 400

        uploaded_file = request.files['file']
        overwrite = request.form.get('overwrite', 'false').lower() == 'true'

        if uploaded_file.filename == '':
            return jsonify({'error': 'Имя файла не указано'}), 400

        safe_name = _normalize_account_filename(uploaded_file.filename)
        file_path = os.path.join(ACCOUNTS_DIR, safe_name)

        if os.path.exists(file_path) and not overwrite:
            return jsonify({'error': 'Файл с таким именем уже существует', 'filename': safe_name}), 400

        uploaded_file.save(file_path)

        return jsonify({
            'success': True,
            'filename': safe_name,
            'records': count_records_in_file(file_path)
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/modules')
def api_modules():
    """API для получения списка модулей"""
    modules = {
        'batyacorp_modules': [
            'nexus.login',
            'discord.login', 
            'telegram.login',
            'telegram.task',
            'twitter.login',
            '2gis.login',
            '2gis.comment',
            '2gis.parse',
            'text_cdp.run'
        ],
        'defi_modules': [
            'uniswap.swap',
            'blast.bridge',
            'scroll.bridge',
            'jup.swap',
            'marginfi.deposit',
            'sanctum.stake',
            'eigenlayer.stake',
            'renzo.stake',
            'symbiotic.stake'
        ],
        'web3_modules': [
            'erc20.transfer',
            'layerzero.bridge',
            'orbiter.bridge',
            'hyperlane.bridge',
            'merkly.mint',
            'oneinch.swap',
            'odos.swap'
        ]
    }
    return jsonify(modules)


@app.route('/api/processes')
def api_processes():
    """Список всех запущенных и завершенных процессов"""
    try:
        processes = process_manager.get_processes_summary()
        return jsonify({'processes': processes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/processes/<command_id>')
def api_process_details(command_id):
    """Подробная информация о процессе"""
    try:
        details = process_manager.get_process_details(command_id)
        if not details:
            return jsonify({'error': 'Процесс не найден'}), 404

        limit = request.args.get('limit', type=int)
        total_logs = len(details.get('logs', []))
        if limit and limit > 0:
            details['logs'] = details['logs'][-limit:]
        details['log_count'] = total_logs

        return jsonify(details)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/processes/<command_id>', methods=['DELETE'])
def api_process_delete(command_id):
    """Удаляет информацию о процессе и его логах"""
    try:
        removed = process_manager.clear_process(command_id)
        if not removed:
            return jsonify({'error': 'Процесс не найден'}), 404
        return jsonify({'success': True, 'command_id': command_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/test_command', methods=['POST'])
def api_test_command():
    """API для тестирования команд"""
    try:
        data = request.json
        command = data.get('command', 'echo "Hello World"')
        
        # Генерируем ID команды
        command_id = f"test_{int(time.time())}"
        
        # Запускаем процесс
        result = process_manager.start_process(command_id, command, cwd="/workspace")
        
        if result == True:
            return jsonify({
                'success': True,
                'command_id': command_id,
                'command': command
            })
        elif isinstance(result, tuple):
            success, error = result
            if success:
                return jsonify({
                    'success': True,
                    'command_id': command_id,
                    'command': command
                })
            else:
                return jsonify({'error': error}), 500
        else:
            return jsonify({'error': 'Failed to start process'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/run', methods=['POST'])
def api_run():
    """API для запуска команд"""
    try:
        data = request.json
        accounts_file = data.get('accounts_file')
        modules = data.get('modules', [])
        project = data.get('project', 'batyacorp')
        network = data.get('network', 'batyacorp')
        parallel = data.get('parallel', 1)
        options = data.get('options', {})
        
        if not accounts_file or not modules:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        # Формируем команду
        modules_str = ','.join(modules)
        
        if parallel > 1:
            # Параллельный запуск
            command = f'python run.py -a {accounts_file} --parallel {parallel} -c "python batyacorp_main.py -p {project} -n {network} -m {modules_str}'
        else:
            # Обычный запуск
            command = f'python batyacorp_main.py -a {accounts_file} -p {project} -n {network} -m {modules_str}'
        
        # Добавляем опции
        if options.get('shuffle'):
            command += ' --shuffle'
        if options.get('await_enter'):
            command += ' -e'
        if options.get('no_proxy'):
            command += ' --no-proxy'
        if options.get('sleep_on_error'):
            command += ' --sleep-on-error'
        if options.get('max_eth_gas_gwei'):
            command += f' --max-eth-gas-gwei {options["max_eth_gas_gwei"]}'
        
        if parallel > 1:
            command += '"'
        
        # Генерируем ID команды
        command_id = f"cmd_{int(time.time())}"
        
        # Запускаем процесс
        result = process_manager.start_process(command_id, command)
        
        if result == True:
            return jsonify({
                'success': True,
                'command_id': command_id,
                'command': command
            })
        elif isinstance(result, tuple):
            success, error = result
            if success:
                return jsonify({
                    'success': True,
                    'command_id': command_id,
                    'command': command
                })
            else:
                return jsonify({'error': error}), 500
        else:
            return jsonify({'error': 'Failed to start process'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stop/<command_id>', methods=['POST'])
def api_stop(command_id):
    """API для остановки процесса"""
    try:
        success = process_manager.stop_process(command_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/status/<command_id>')
def api_status(command_id):
    """API для получения статуса процесса"""
    try:
        details = process_manager.get_process_details(command_id)
        if not details:
            return jsonify({'error': 'Процесс не найден'}), 404

        limit = request.args.get('limit', default=200, type=int)
        logs = details.get('logs', [])
        total_logs = len(logs)
        if limit and limit > 0:
            logs = logs[-limit:]

        return jsonify({
            'status': process_manager.get_process_status(command_id),
            'logs': logs,
            'command': details.get('command'),
            'started_at': details.get('started_at'),
            'finished_at': details.get('finished_at'),
            'exit_code': details.get('exit_code'),
            'pid': details.get('pid'),
            'log_count': total_logs
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings')
def api_settings():
    """API для получения настроек"""
    try:
        settings_path = os.path.join(CRYPTO_PLAYGROUND_PATH, 'settings.py')
        if os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'content': content})
        else:
            return jsonify({'error': 'Settings file not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxies/test', methods=['POST'])
def api_test_proxies():
    """API для запуска тестирования прокси"""
    global testing_progress
    
    try:
        data = request.json
        proxy_text = data.get('proxies', '')
        
        if not proxy_text.strip():
            return jsonify({'error': 'Список прокси пуст'}), 400
        
        if testing_progress['is_running']:
            return jsonify({'error': 'Тестирование уже выполняется'}), 400
        
        proxy_list = [line.strip() for line in proxy_text.split('\n') if line.strip()]
        
        # Запускаем тестирование в отдельном потоке
        thread = threading.Thread(target=run_proxy_test, args=(proxy_list,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'message': f'Запущено тестирование {len(proxy_list)} прокси'
        })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxies/stop', methods=['POST'])
def api_stop_proxies():
    """API для остановки тестирования прокси"""
    global stop_testing, testing_progress
    
    stop_testing = True
    testing_progress['is_running'] = False
    
    return jsonify({'success': True})

@app.route('/api/proxies/progress')
def api_proxies_progress():
    """API для получения прогресса тестирования"""
    return jsonify(testing_progress)

@app.route('/api/proxies/state')
def api_proxies_state():
    """Сводное состояние страницы прокси"""
    return jsonify({
        'progress': dict(testing_progress),
        'is_running': testing_progress.get('is_running', False),
        'working': list(current_working_proxies),
        'unique': list(current_unique_proxies),
        'exported_filename': last_exported_filename,
    })

@app.route('/api/proxies/working')
def api_proxies_working():
    """API для получения рабочих прокси"""
    return jsonify({'working': current_working_proxies})

@app.route('/api/proxies/unique')
def api_proxies_unique():
    """API для получения уникальных прокси"""
    return jsonify({'unique': current_unique_proxies})

# Удаляем старый endpoint - заменен на /api/proxies/progress, /api/proxies/working, /api/proxies/unique

@app.route('/api/proxies/export', methods=['POST'])
def api_export_proxies():
    """API для экспорта прокси в TSV файл"""
    global last_exported_filename
    try:
        # Создаем директорию если не существует
        proxies_dir = os.path.join(CRYPTO_PLAYGROUND_PATH, 'files', 'proxies')
        os.makedirs(proxies_dir, exist_ok=True)

        # Генерируем имя файла с текущей датой
        current_date = datetime.now().strftime('%d.%m.%y')
        filename = f'proxies{current_date}.tsv'
        file_path = os.path.join(proxies_dir, filename)
        relative_path = os.path.join('files', 'proxies', filename)

        # Сохраняем уникальные прокси в оригинальном формате
        with open(file_path, 'w', encoding='utf-8') as f:
            for proxy in current_unique_proxies:
                original_format = original_formats.get(proxy, proxy)
                f.write(original_format + '\n')

        last_exported_filename = filename

        display_command = (
            f"python supply\\sync_proxies_v2.py -f files\\proxies\\{filename}"
        )

        return jsonify({
            'success': True,
            'filename': filename,
            'path': file_path,
            'relative_path': relative_path,
            'count': len(current_unique_proxies),
            'display_command': display_command
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxies/sync', methods=['POST'])
def api_sync_proxies():
    """API для синхронизации прокси с БД"""
    global last_exported_filename
    try:
        data = request.json
        filename = data.get('filename') if data else None

        if not filename:
            filename = last_exported_filename

        if not filename:
            return jsonify({'error': 'Имя файла не указано'}), 400

        filename = os.path.basename(filename)
        relative_path = os.path.join('files', 'proxies', filename)
        absolute_path = os.path.join(PROXIES_DIR, filename)

        if not os.path.exists(absolute_path):
            return jsonify({'error': 'Файл не найден для синхронизации'}), 404

        # Формируем команду синхронизации
        script_path = os.path.join('supply', 'sync_proxies_v2.py')
        command = f'python "{script_path}" -f "{relative_path}"'

        # Генерируем ID команды
        command_id = f"proxy_sync_{int(time.time())}"

        # Запускаем процесс
        result = process_manager.start_process(command_id, command)
        
        if result == True:
            return jsonify({
                'success': True,
                'command_id': command_id,
                'command': command,
                'display_command': f"python supply\\sync_proxies_v2.py -f files\\proxies\\{filename}"
            })
        elif isinstance(result, tuple):
            success, error = result
            if success:
                return jsonify({
                    'success': True,
                    'command_id': command_id,
                    'command': command,
                    'display_command': f"python supply\\sync_proxies_v2.py -f files\\proxies\\{filename}"
                })
            else:
                return jsonify({'error': error}), 500
        else:
            return jsonify({'error': 'Failed to start sync process'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/modules/2gis/comment/save', methods=['POST'])
def api_save_2gis_comment_data():
    """API для сохранения данных 2gis comment"""
    try:
        data = request.json
        comment_data = data.get('data', '')
        
        if not comment_data.strip():
            return jsonify({'error': 'Данные не указаны'}), 400
        
        # Создаем директорию если не существует
        files_dir = os.path.join(CRYPTO_PLAYGROUND_PATH, 'files')
        os.makedirs(files_dir, exist_ok=True)
        
        # Сохраняем данные в файл
        filename = 'acc_2gis_comment.tsv'
        file_path = os.path.join(files_dir, filename)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(comment_data)
        
        # Подсчитываем количество записей
        lines = [line.strip() for line in comment_data.split('\n') if line.strip()]
        valid_lines = sum(1 for line in lines if len(line.split('\t')) >= 3)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'path': file_path,
            'records': valid_lines
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/modules/2gis/comment/run', methods=['POST'])
def api_run_2gis_comment():
    """API для запуска модуля 2gis comment"""
    try:
        # Формируем команду
        command = 'python batyacorp_main.py -a ./files/acc_2gis_comment.tsv -p batyacorp -m 2gis.comment -e --proxy'
        
        # Генерируем ID команды
        command_id = f"2gis_comment_{int(time.time())}"
        
        # Запускаем процесс
        result = process_manager.start_process(command_id, command)
        
        if result == True:
            return jsonify({
                'success': True,
                'command_id': command_id,
                'command': command
            })
        elif isinstance(result, tuple):
            success, error = result
            if success:
                return jsonify({
                    'success': True,
                    'command_id': command_id,
                    'command': command
                })
            else:
                return jsonify({'error': error}), 500
        else:
            return jsonify({'error': 'Failed to start 2gis comment module'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Socket.IO обработчики удалены - используем HTTP polling

if __name__ == '__main__':
    # Создаем папки для шаблонов и статических файлов
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    
    # Запускаем приложение (без Socket.IO)
    app.run(host='0.0.0.0', port=54583, debug=False, threaded=True)