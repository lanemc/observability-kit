import asyncio
import time
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Import observability (in real usage, this would be: from lite_observability import init_observability)
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'python', 'src'))

from lite_observability import init_observability, create_span, record_metric, trace_function, monitor_function

# Data models
class User(BaseModel):
    id: Optional[int] = None
    name: str
    email: str
    created_at: Optional[str] = None

class UserCreate(BaseModel):
    name: str
    email: str

# Initialize observability
async def setup_observability():
    await init_observability(
        dashboard=True,
        dashboard_port=8001,
        service_name='example-fastapi-app',
        environment='development'
    )

# Create FastAPI app
app = FastAPI(title="FastAPI with Observability", version="1.0.0")

# Sample data
users_db = [
    {"id": 1, "name": "John Doe", "email": "john@example.com"},
    {"id": 2, "name": "Jane Smith", "email": "jane@example.com"},
    {"id": 3, "name": "Bob Johnson", "email": "bob@example.com"}
]

@app.on_event("startup")
async def startup_event():
    await setup_observability()
    print("🚀 FastAPI server starting...")
    print("📊 Observability dashboard: http://localhost:8001")

@app.get("/")
async def root():
    return {
        "message": "Hello from FastAPI with Observability!",
        "timestamp": time.time()
    }

@app.get("/api/users", response_model=List[User])
@trace_function("get_users")
async def get_users():
    # Simulate some async work
    await asyncio.sleep(0.1)
    
    # Use custom span
    async with create_span("fetch_users_from_db"):
        # Simulate database call
        await asyncio.sleep(0.05)
        
        # Record custom metric
        record_metric("users_fetched", len(users_db), {"operation": "list"})
        
        return users_db

@app.post("/api/users", response_model=User, status_code=201)
@monitor_function("create_user")
async def create_user(user: UserCreate):
    # Record custom metric
    record_metric("user_created", 1, {"source": "api"})
    
    new_user = {
        "id": len(users_db) + 1,
        "name": user.name,
        "email": user.email,
        "created_at": time.time()
    }
    
    users_db.append(new_user)
    return new_user

@app.get("/api/users/{user_id}", response_model=User)
async def get_user(user_id: int):
    async with create_span("find_user_by_id"):
        # Simulate database lookup
        await asyncio.sleep(0.02)
        
        user = next((u for u in users_db if u["id"] == user_id), None)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return user

@app.get("/api/slow")
async def slow_endpoint():
    # Simulate slow endpoint
    await asyncio.sleep(2.0)
    return {"message": "This was slow!"}

@app.get("/api/error")
async def error_endpoint():
    # Simulate error
    raise HTTPException(status_code=500, detail="Simulated error for testing")

@app.get("/api/cpu-intensive")
def cpu_intensive():
    # Simulate CPU-intensive work
    total = 0
    for i in range(1000000):
        total += i * i
    
    record_metric("cpu_intensive_result", total, {"operation": "calculation"})
    return {"result": total}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time()
    }

if __name__ == "__main__":
    print("🚀 Starting FastAPI server with observability...")
    print("📋 Try these endpoints:")
    print("  GET  http://localhost:8000/")
    print("  GET  http://localhost:8000/api/users")
    print("  POST http://localhost:8000/api/users")
    print("  GET  http://localhost:8000/api/users/1")
    print("  GET  http://localhost:8000/api/slow")
    print("  GET  http://localhost:8000/api/error")
    print("  GET  http://localhost:8000/api/cpu-intensive")
    print("  GET  http://localhost:8000/docs (FastAPI docs)")
    
    uvicorn.run(
        "fastapi_app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        access_log=True
    )