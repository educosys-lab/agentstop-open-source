=== Installation ===

1. Install Poetry
   Linux command: curl -sSL https://install.python-poetry.org | python3 -
   Windows command (Powershell): (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | py -

2. Update environment variables path on Windows.

    - Go to the following folder location.
    - user folder -> AppData -> Roaming -> Python -> Scripts
    - Copy this file path and add it in the "Path" list under the user variables.
    - Check if it is installed properly: poetry --version

3. Update Settings
   Open new instance of bash/cmd
   Command: poetry config virtualenvs.in-project true

4. Optional Steps
   Check if make is installed
   Command: make --version

    If not then follow the steps below.
    ----- Linux -----
    Command: sudo apt-get install build-essential

    ----- Windows (Use Powershell) -----
    Check if chocolatey is installed
    Command: choco -v

    If not then follow the steps below.
    Note: Run Get-ExecutionPolicy. If it returns Restricted, then run Set-ExecutionPolicy AllSigned or Set-ExecutionPolicy Bypass -Scope Process.

    Command 1: Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

    Command 2: choco install make

5. Install all required dependencies
   poetry install

6. Start project
   Local: poetry run python scripts/start.py local
   Docker: poetry run python scripts/start.py docker

7. Add dependency
   poetry add <package>

8. Add dev dependency
   poetry add --group dev <package>

9. Remove dependency
   poetry remove <package>

10. Show all active packages
    poetry show

11. format
    poetry run black .

12. lint
    poetry run flake8 .

13. clear-cache
    poetry run python scripts/clear_cache.py

14. freeze
    poetry export --without-hashes -f requirements.txt > requirements.txt
