import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="Asia/Kolkata")


def _run_scheme_master_sync():
    from app.database import SessionLocal
    from app.services.scheme_master_service import fetch_and_sync_scheme_master
    db = SessionLocal()
    try:
        result = fetch_and_sync_scheme_master(db)
        logger.info(f"[Scheduler] Scheme master sync: {result}")
    except Exception as e:
        logger.error(f"[Scheduler] Scheme master sync failed: {e}")
    finally:
        db.close()


def _run_daily_nav_sync():
    from app.database import SessionLocal
    from app.services.nav_service import fetch_daily_nav
    db = SessionLocal()
    try:
        result = fetch_daily_nav(db)
        logger.info(f"[Scheduler] Daily NAV sync: {result}")
    except Exception as e:
        logger.error(f"[Scheduler] Daily NAV sync failed: {e}")
    finally:
        db.close()


def _run_tracking_sync():
    from app.database import SessionLocal
    from app.services.tracking_service import sync_tracking_error, sync_tracking_difference
    db = SessionLocal()
    try:
        r1 = sync_tracking_error(db)
        r2 = sync_tracking_difference(db)
        logger.info(f"[Scheduler] Tracking sync: TE={r1}, TD={r2}")
    except Exception as e:
        logger.error(f"[Scheduler] Tracking sync failed: {e}")
    finally:
        db.close()


def _run_snapshot_refresh():
    from app.database import SessionLocal
    from app.services.analytics_service import refresh_all_snapshots
    db = SessionLocal()
    try:
        result = refresh_all_snapshots(db)
        logger.info(f"[Scheduler] Snapshot refresh: {result}")
    except Exception as e:
        logger.error(f"[Scheduler] Snapshot refresh failed: {e}")
    finally:
        db.close()


def start_scheduler():
    # Scheme Master: every 30 days (4-weekly Sunday 2AM)
    scheduler.add_job(
        _run_scheme_master_sync,
        trigger=CronTrigger(week="*/4", day_of_week="sun", hour=2, minute=0),
        id="scheme_master_sync",
        replace_existing=True,
    )

    # Daily NAV: every day at 9:30 AM IST
    scheduler.add_job(
        _run_daily_nav_sync,
        trigger=CronTrigger(hour=9, minute=30),
        id="daily_nav_sync",
        replace_existing=True,
    )

    # Tracking data: 5th of every month at 6 AM
    scheduler.add_job(
        _run_tracking_sync,
        trigger=CronTrigger(day=5, hour=6, minute=0),
        id="tracking_sync",
        replace_existing=True,
    )

    # Snapshot refresh: nightly at 1 AM
    scheduler.add_job(
        _run_snapshot_refresh,
        trigger=CronTrigger(hour=1, minute=0),
        id="snapshot_refresh",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler started with all jobs registered")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler stopped")
