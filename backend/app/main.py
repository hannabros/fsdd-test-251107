from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import files, projects

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Document Workspace API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(files.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
