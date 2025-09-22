#!/usr/bin/env python3
"""
Secure Backup-Skript für den movie-mcp-prototype Workspace
Erstellt ein .rar-Archiv des kompletten Workspace-Inhalts mit Sicherheits- und Performance-Verbesserungen
"""


import os
import sys
import time
import shutil
import tempfile
from contextlib import suppress
from pathlib import Path
from datetime import datetime
import subprocess
import logging
import re
from contextlib import contextmanager

# Logging konfigurieren
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('f:\\workspace\\movie-mcp-prototype\\logs\\system.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

def sanitize_log_input(text):
    """Sanitisiert Input für sicheres Logging"""
    if not isinstance(text, str):
        text = str(text)
    # Entferne/ersetze gefährliche Zeichen
    return re.sub(r'[\r\n\t]', '_', text)

class WorkspaceBackup:
    def __init__(self, workspace_path="f:\\workspace\\movie-mcp-prototype"):
        # Sichere Pfad-Validierung
        self.workspace_path = Path(workspace_path).resolve()
        if not self._is_safe_path(self.workspace_path):
            raise ValueError(f"Unsicherer Workspace-Pfad: {workspace_path}")

        self.backup_dir = self.workspace_path / "backup"
        self.excluded_dirs = {'.venv', '.venv311', 'data', 'logs', 'node_modules', '__pycache__', '.git'}
        self.excluded_extensions = {'.pyc', '.rar', '.duckdb', '.duckdb.wal', '.pyo', '.pyd', '.so', '.dll', '.exe'}

        # Sicherstellen, dass der Backup-Ordner existiert
        self.backup_dir.mkdir(exist_ok=True)

    def _is_safe_path(self, path):
        """Validiert Pfad gegen Directory Traversal"""
        try:
            path = path.resolve()
            # Prüfe auf gefährliche Pfad-Komponenten
            path_str = str(path)
            return '..' not in path.parts and not path_str.startswith('\\\\')
        except (OSError, ValueError):
            return False

    def should_exclude(self, path):
        """Prüft, ob ein Pfad ausgeschlossen werden soll"""
        # Ausschluss von Verzeichnissen - prüfe auch Pfad-String
        path_str = str(path)
        if any(excluded in path.parts for excluded in self.excluded_dirs):
            return True
        if any(f"\\{excluded}\\" in path_str or path_str.endswith(f"\\{excluded}") for excluded in self.excluded_dirs):
            return True

        # Ausschluss von Dateierweiterungen
        return path.suffix in self.excluded_extensions

    def get_file_list_optimized(self):
        """Optimierte Dateilisten-Erstellung mit os.scandir()"""
        files_to_backup = []
        total_size = 0

        logging.info(f"Scanne Workspace: {sanitize_log_input(str(self.workspace_path))}")

        def scan_directory(dir_path):
            nonlocal total_size
            try:
                with os.scandir(dir_path) as entries:
                    for entry in entries:
                        if entry.is_dir():
                            # Überspringe ausgeschlossene Verzeichnisse
                            if entry.name in self.excluded_dirs:
                                logging.debug(f"Verzeichnis ausgeschlossen: {entry.name}")
                                continue
                            # Überspringe Backup-Ordner
                            if Path(entry.path) == self.backup_dir:
                                continue
                            # Rekursiver Aufruf
                            scan_directory(entry.path)
                        elif entry.is_file():
                            file_path = Path(entry.path)

                            # Überspringe ausgeschlossene Dateien
                            if self.should_exclude(file_path):
                                continue

                            files_to_backup.append(str(file_path))
                            with suppress(OSError):
                                total_size += entry.stat().st_size
            except OSError as e:
                logging.warning(f"Fehler beim Scannen von {sanitize_log_input(str(dir_path))}: {sanitize_log_input(str(e))}")

        scan_directory(self.workspace_path)

        logging.info(f"Gefunden: {len(files_to_backup)} Dateien, Gesamtgröße: {total_size / (1024*1024):.2f} MB")
        return files_to_backup

    def find_rar_executable(self):
        """Sucht nach WinRAR-Installation mit shutil.which()"""
        if rar_cmd := shutil.which("rar") or shutil.which("winrar"):
            logging.info(f"RAR in PATH gefunden: {sanitize_log_input(rar_cmd)}")
            return rar_cmd

        # Fallback zu Standard-Installationspfaden
        possible_paths = [
            "C:\\Program Files\\WinRAR\\WinRAR.exe",
            "C:\\Program Files (x86)\\WinRAR\\WinRAR.exe",
            "C:\\Program Files\\WinRAR\\Rar.exe",
            "C:\\Program Files (x86)\\WinRAR\\Rar.exe"
        ]

        for path in possible_paths:
            if os.path.exists(path):
                logging.info(f"WinRAR gefunden: {sanitize_log_input(path)}")
                return path

        return None

    @contextmanager
    def temp_file_list(self, files):
        """Context Manager für temporäre Dateiliste"""
        temp_file = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                           suffix='.txt', delete=False) as f:
                temp_file = f.name
                for file_path in files:
                    # Sichere relative Pfade
                    try:
                        rel_path = os.path.relpath(file_path, self.workspace_path)
                        rel_path = rel_path.replace('\\', '/')
                        f.write(f"{rel_path}\n")
                    except ValueError:
                        # Skip Dateien außerhalb des Workspace
                        continue
            yield temp_file
        finally:
            if temp_file and os.path.exists(temp_file):
                with suppress(OSError):
                    os.unlink(temp_file)

    def _execute_rar_command(self, cmd, cwd, timeout=3600):
        """Sichere subprocess-Ausführung"""
        try:
            logging.info(f"Führe Kommando aus: {sanitize_log_input(' '.join(cmd))}")

            return subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=cwd,
                shell=False,  # Explizit für Sicherheit
            )
        except subprocess.TimeoutExpired:
            logging.error("Prozess-Timeout erreicht")
            return None
        except Exception as e:
            logging.error(f"Subprocess-Fehler: {sanitize_log_input(str(e))}")
            return None

    def create_rar_backup_winrar(self, rar_exe, backup_path):
        """Erstellt Backup mit WinRAR"""
        try:
            files = self.get_file_list_optimized()

            with self.temp_file_list(files) as file_list_path:
                logging.info(f"Temporäre Dateiliste: {sanitize_log_input(file_list_path)}")

                # WinRAR-Kommando mit Dateiliste
                cmd = [
                    rar_exe,
                    "a",  # Add to archive
                    "-r",  # Recurse subdirectories
                    "-m5",  # Maximum compression
                    str(backup_path),
                    f"@{file_list_path}"
                ]

                result = self._execute_rar_command(cmd, self.workspace_path)

                if result and result.returncode == 0:
                    if backup_path.exists():
                        size_mb = backup_path.stat().st_size / (1024*1024)
                        logging.info(f"Backup erfolgreich: {sanitize_log_input(str(backup_path))}, Größe: {size_mb:.2f} MB")
                        return True
                    else:
                        logging.error("Backup-Datei nicht gefunden")
                        return False
                else:
                    if result:
                        logging.error(f"WinRAR-Fehler (Code: {result.returncode})")
                        logging.error(f"Stderr: {sanitize_log_input(result.stderr)}")
                    return False

        except Exception as e:
            logging.error(f"Backup-Fehler: {sanitize_log_input(str(e))}")
            return False

    def create_rar_backup(self):
        """Erstellt das .rar-Backup"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"movie-mcp-prototype_backup_{timestamp}.rar"
        backup_path = self.backup_dir / backup_name

        logging.info(f"Erstelle Backup: {sanitize_log_input(backup_name)}")

        # Prüfe WinRAR-Verfügbarkeit
        rar_exe = self.find_rar_executable()
        if not rar_exe:
            logging.error("WinRAR nicht gefunden. Verwende ZIP-Fallback.")
            return self.create_zip_backup_fallback(backup_path.with_suffix('.zip'))

        return self.create_rar_backup_winrar(rar_exe, backup_path)

    def create_zip_backup_fallback(self, backup_path):
        """Fallback: ZIP-Backup mit Progress-Feedback"""
        try:
            import zipfile

            logging.info("Verwende ZIP-Fallback")
            files = self.get_file_list_optimized()

            with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
                for i, file_path in enumerate(files):
                    try:
                        rel_path = os.path.relpath(file_path, self.workspace_path)
                        zipf.write(file_path, rel_path)

                        # Progress-Feedback
                        if (i + 1) % 100 == 0:
                            progress = (i + 1) / len(files) * 100
                            logging.info(f"Fortschritt: {progress:.1f}% ({i + 1}/{len(files)})")

                    except Exception as e:
                        logging.warning(f"Datei übersprungen: {sanitize_log_input(str(e))}")
                        continue

            if backup_path.exists():
                size_mb = backup_path.stat().st_size / (1024*1024)
                logging.info(f"ZIP-Backup erfolgreich: {size_mb:.2f} MB")
                return True
            return False

        except Exception as e:
            logging.error(f"ZIP-Backup-Fehler: {sanitize_log_input(str(e))}")
            return False

    def cleanup_old_backups(self, keep_count=250):
        """Bereinigt alte Backups mit verbesserter Performance"""
        try:
            # Sammle Backup-Dateien mit einem Scan
            backup_files = []
            with os.scandir(self.backup_dir) as entries:
                backup_files.extend(
                    (Path(entry.path), entry.stat().st_mtime)
                    for entry in entries
                    if entry.is_file() and entry.name.endswith(('.rar', '.zip'))
                )
            if len(backup_files) <= keep_count:
                return

            # Sortiere nach Änderungsdatum (neueste zuerst)
            backup_files.sort(key=lambda x: x[1], reverse=True)

            # Lösche alte Backups
            for backup_path, _ in backup_files[keep_count:]:
                try:
                    backup_path.unlink()
                    logging.info(f"Altes Backup gelöscht: {sanitize_log_input(backup_path.name)}")
                except Exception as e:
                    logging.warning(f"Löschfehler: {sanitize_log_input(str(e))}")

        except Exception as e:
            logging.error(f"Bereinigungsfehler: {sanitize_log_input(str(e))}")

    def run_backup(self):
        """Führt den kompletten Backup-Prozess aus"""
        start_time = time.time()

        logging.info("=== movie-mcp-prototype WORKSPACE BACKUP STARTET ===")
        logging.info(f"Workspace: {sanitize_log_input(str(self.workspace_path))}")

        try:
            if self.create_rar_backup():
                self.cleanup_old_backups()

                elapsed_time = time.time() - start_time
                logging.info(f"=== BACKUP ERFOLGREICH ({elapsed_time:.2f}s) ===")
                return True
            else:
                logging.error("=== BACKUP FEHLGESCHLAGEN ===")
                return False

        except Exception as e:
            logging.error(f"=== UNERWARTETER FEHLER: {sanitize_log_input(str(e))} ===")
            return False

def main():
    """Hauptfunktion"""
    try:
        backup = WorkspaceBackup()

        if not backup.workspace_path.exists():
            logging.error(f"Workspace-Pfad existiert nicht: {backup.workspace_path}")
            return 1

        success = backup.run_backup()
        return 0 if success else 1

    except Exception as e:
        logging.error(f"Initialisierungsfehler: {sanitize_log_input(str(e))}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
