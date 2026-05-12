import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine
from app.jobs.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Creating MySQL database tables...")
    # MySQL requires explicit charset on create_all — handled via __table_args__
    Base.metadata.create_all(bind=engine)
    logger.info("Tables created. Starting scheduler...")
    start_scheduler()
    yield
    logger.info("Stopping scheduler...")
    stop_scheduler()


app = FastAPI(
    title="Mutual Fund Analytics API",
    description="Comprehensive API for AMFI mutual fund data - NAV, AUM, Disclosures, Analytics",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import (
    scheme_master, nav, aum, analytics, tracking, disclosure, market_cap, admin
)
from app.routers.portfolio import router as portfolio_router
from app.routers.dividend import router as dividend_router
from app.routers.nps import router as nps_router

app.include_router(scheme_master.router)
app.include_router(nav.router)
app.include_router(aum.router)
app.include_router(analytics.router)
app.include_router(tracking.router)
app.include_router(disclosure.router)
app.include_router(market_cap.router)
app.include_router(admin.router)
app.include_router(portfolio_router)
app.include_router(dividend_router)
app.include_router(nps_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/health/db")
def db_health():
    from app.database import SessionLocal
    from sqlalchemy import text
    db = None
    try:
        db = SessionLocal()
        result = db.execute(text("SELECT VERSION()")).fetchone()
        return {"status": "ok", "database": "connected", "mysql_version": result[0] if result else "unknown"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
    finally:
        if db:
            db.close()
