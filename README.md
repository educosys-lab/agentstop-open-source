## ⚙️ Agentstop — Workflow Automation Platform

<p align="center">
  <a href="https://github.com/educosys-lab/agentstop/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js"></a>
  <a href="https://nestjs.com"><img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS"></a>
  <a href="https://www.python.org"><img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"></a>
</p>

<br/>

### 🧩 What is Agentstop?

**Agentstop** is a next-generation **workflow automation system** — an open-source alternative to platforms like **n8n** and **Make.com**.
It empowers developers and businesses to **automate complex workflows**, integrate **AI-powered decisions**, and connect multiple services through a simple, visual interface.

### 🚀 What Does It Do?

Agentstop allows you to:

-   Build automation workflows using **AI-driven triggers and actions**
-   Connect external APIs, databases, and AI services
-   Chain tasks visually — no heavy coding required
-   Execute automations reliably using **NestJS**, **Next.js**, and **Python**
-   Self-host the full stack (Frontend + Backend + AI Server)

It's designed for **scalability, flexibility, and transparency** — and now, it's completely **open source**.

### ⚙️ How Does It Work?

Agentstop runs as a **three-part system**, all contained in a single repository:

1. 🧱 **Frontend** — Built with **Next.js**, provides the user interface
2. ⚙️ **Backend** — Built with **NestJS**, handles API logic, workflows, and database operations
3. 🤖 **AI Server** — Built with **Python (FastAPI)**, handles AI reasoning, prompt execution, and intelligent task management

These services communicate internally using REST APIs and WebSocket connections.
**Redis** is used for caching and job queues, while **MongoDB** stores user data and workflow definitions.

<br/>

### 🧰 Installation Methods

You can set up Agentstop using **two different methods**:

#### 🐳 **Option 1: Docker Setup (Recommended)**

This method automatically deploys the **Frontend**, **Backend**, and **AI Server** containers using Docker Compose.

#### Requirements

-   [Docker](https://docs.docker.com/get-docker/)
-   [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) _(for Windows users)_

#### Installation Command

```bash
curl -fsSL https://raw.githubusercontent.com/educosys-lab/agentstop/main/install-docker.sh | bash
```

#### Notes for Windows Users

Ensure WSL is installed before running Docker.

Install with:

```bash
wsl --install
```

Restart your system and install Docker Desktop.

<br/>

#### 💻 **Option 2: Direct Local Setup (Without Docker)**

This method installs and runs all three services directly on your local machine.

#### Installation Command

```bash
curl -fsSL https://raw.githubusercontent.com/educosys-lab/agentstop/main/install.sh | bash
```

The script will:

-   Clone the repository
-   Install dependencies for Frontend, Backend, and AI Server
-   Automatically start all three services

#### For Windows Users

You must have Git Bash installed (comes with Git).

Download: https://git-scm.com/downloads

Open Git Bash and run the installation command above.

#### Running the Project

After installation, go inside the project folder then you can use the following scripts:

**Start development servers:**

```bash
bash local.sh
```

This will start all three services (Frontend, Backend, and AI Server) in separate terminal windows.

**Build the project:**

```bash
bash build.sh
```

This will build both Frontend and Backend projects for production.

**Start the built project:**

```bash
bash start.sh
```

This will start the built Frontend, Backend, and AI Server in separate terminal windows.

**Note:** All scripts automatically detect your package manager (pnpm, yarn, or npm) and require a `.env` file at the project root.

<br/>

### 📦 Dependencies

#### 🧱 Frontend (Next.js) & Backend (NestJS)

-   Node.js ≥ 20
-   pnpm (preferred but optional)

#### Install Node.js

**Linux / macOS (using nvm):**

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
nvm install 20
```

**Windows:**

Download from: https://nodejs.org/

#### Install pnpm

```bash
npm install -g pnpm
```

<br/>

### 🤖 AI Server (Python + FastAPI)

-   Python ≥ 3.13, < 3.14 (⚠️ Other versions will not work)
-   Poetry package manager

#### Install Python

**Linux / macOS:**

```bash
sudo apt update
sudo apt install python3.13 python3.13-venv python3.13-dev
```

**Windows:**

Download Python 3.13 from: https://www.python.org/downloads/

#### Install Poetry

```bash
curl -sSL https://install.python-poetry.org | python3 -
```

<br/>

### 🔐 Environment Setup

Requires one `.env` file at the root of the project.

A sample file exists: `example-env`

Rename it to `.env` and fill in your own values.

<br/>

### 🧾 Environment Variable Details

| Variable                                              | Description                            | Where to Get                                                                 |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `ENV`                                                 | Environment type (local / production)  | Keep as local                                                                |
| `FRONTEND_URL` / `BACKEND_URL` / `PYTHON_BACKEND_URL` | Internal service URLs                  | Default is fine for local                                                    |
| `ENCRYPTION_KEY` / `SECURITY_KEY`                     | Internal encryption keys               | Any random secure string                                                     |
| `FIRECRAWL_API_KEY`                                   | API key for Firecrawl content crawling | Get free key from [Firecrawl.dev](https://firecrawl.dev)                     |
| `GOOGLE_CLIENT_ID` / `SECRET`                         | For Google authentication              | Create a project at [Google Cloud Console](https://console.cloud.google.com) |
| `JWT_SECRET`                                          | JWT encryption key                     | Any secure random string                                                     |
| `MONGODB_URI` / `NAME`                                | MongoDB connection                     | Use free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)                |
| `NGROK_AUTHTOKEN`                                     | For local tunneling                    | Get free from [ngrok.com](https://ngrok.com)                                 |
| `OPENAI_API_KEY`                                      | For AI generation                      | Get from [OpenAI](https://platform.openai.com)                               |
| `PINECONE_KEY` / `REGION` / `INDEX_NAME`              | Vector database integration            | Get from [Pinecone.io](https://www.pinecone.io)                              |
| `UPLOAD_PATH`                                         | File upload directory                  | Default: `/app/uploads`                                                      |
| `NEXT_PUBLIC_*`                                       | Public variables for frontend          | Keep default unless customized                                               |
| `REDIS_*`                                             | Redis cache configuration              | Automatically handled with Docker                                            |

🧠 **Note:**
We do not collect any user data. All keys are user-managed — bring your own credentials.

<br/>

### 🧑‍💻 Cross-Platform Notes

| Platform    | Notes                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| **Windows** | Use Git Bash for scripts. Install WSL + Docker Desktop for Docker setup. |
| **Linux**   | Fully supported (tested on Ubuntu, Debian, Fedora).                      |
| **macOS**   | Works natively. Ensure Docker & Python 3.13 are installed.               |

<br/>

### 🛠️ Developer Notes

-   `install.sh` and `install-docker.sh` scripts handle most setup tasks automatically.

-   If permission issues occur:

```bash
chmod +x install.sh install-docker.sh
```

-   Avoid committing `.env` files or secret keys.

-   Use pnpm over npm for faster installs.

-   Run `poetry install` inside `ai-server/` if managing Python dependencies manually.

<br/>

### 🐞 Reporting Issues

If you encounter any issues or bugs:

-   **📧 Email:** support@educosys.com
-   **🧾 Subject:** Bug Report for Agentstop

Please include:

-   Steps to reproduce
-   Error logs (if available)
-   OS and environment details

### 🤝 Contributing

Agentstop is open source — we welcome your contributions! 🎉

### How to Contribute

1.  Fork the repository
2.  Create a new branch:

```bash
git checkout -b feat/my-feature
```

3.  Make your changes
4.  Commit and push
5.  Open a Pull Request (PR)

We actively review and merge community PRs.
You can also create your own fork for customization.

<br/>

### 🌍 Community & Support

-   **💾 GitHub Repo:** [Agentstop Open Source](https://github.com/educosys-lab/agentstop)
-   **📧 Support:** support@educosys.com

<br/>

### 🧠 License

This project is licensed under the MIT License — you are free to use, modify, and distribute it.

### 🌟 Join the Mission

By contributing, you help developers build smarter, cheaper, and faster automation systems — openly.
Let's make automation accessible for everyone. 💪
