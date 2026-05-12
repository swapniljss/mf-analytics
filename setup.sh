#!/bin/bash
set -e

echo "=== Mutual Fund Analytics - Setup Script ==="

# Backend setup
echo ""
echo ">> Setting up backend..."
cd backend
cp .env.example .env 2>/dev/null || true
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "Backend dependencies installed."

# Create .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from example. Update DATABASE_URL if needed."
fi

cd ..

# Frontend setup
echo ""
echo ">> Setting up frontend..."
cd frontend
npm install
echo "Frontend dependencies installed."
cd ..

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start development:"
echo "  1. Start MySQL:    docker-compose up mysql -d"
echo "     (wait ~15s for MySQL to be ready)"
echo "  2. Start backend:  cd backend && source venv/bin/activate && python run.py"
echo "  3. Start frontend: cd frontend && npm run dev"
echo ""
echo "Or start everything with Docker Compose:"
echo "  docker-compose up --build"
echo ""
echo "MySQL:       localhost:3306  (root / password)"
echo "Backend API: http://localhost:8000"
echo "API Docs:    http://localhost:8000/docs"
echo "Frontend:    http://localhost:5173"
