"""Add analytics enhancements, scheme metadata, and portfolio holdings tables

Revision ID: d1e2f3a4b5c6
Revises: a3c9e1b72d44
Create Date: 2026-04-23
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'a3c9e1b72d44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Analytics snapshot: new computed fields ---
    for col, typ in [
        ('nav_52w_high',    sa.Numeric(18, 6)),
        ('nav_52w_low',     sa.Numeric(18, 6)),
        ('sip_return_1y',   sa.Numeric(10, 6)),
        ('sip_return_3y',   sa.Numeric(10, 6)),
        ('sip_return_5y',   sa.Numeric(10, 6)),
        ('sharpe_ratio',    sa.Numeric(10, 6)),
        ('beta',            sa.Numeric(10, 6)),
        ('std_deviation',   sa.Numeric(10, 6)),
    ]:
        try:
            op.add_column('scheme_analytics_snapshot', sa.Column(col, typ, nullable=True))
        except Exception:
            pass

    # --- Scheme master: metadata fields ---
    for col, typ in [
        ('face_value',                   sa.Numeric(18, 4)),
        ('investment_objective',         sa.Text),
        ('fund_manager_name',            sa.String(500)),
        ('fund_manager_experience',      sa.String(200)),
        ('alternate_benchmark',          sa.String(500)),
        ('min_investment_amount',        sa.Numeric(18, 2)),
        ('additional_investment_amount', sa.Numeric(18, 2)),
        ('sip_min_amount',               sa.Numeric(18, 2)),
        ('dividend_frequency',           sa.String(100)),
        ('maturity_type',                sa.String(100)),
        ('exit_load',                    sa.String(500)),
        ('entry_load',                   sa.String(500)),
    ]:
        try:
            op.add_column('scheme_master', sa.Column(col, typ, nullable=True))
        except Exception:
            pass

    # --- Portfolio holdings tables ---
    op.create_table(
        'portfolio_upload',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('report_month', sa.String(7), nullable=False),
        sa.Column('source_filename', sa.String(500), nullable=False),
        sa.Column('uploaded_by', sa.String(100), nullable=True),
        sa.Column('status', sa.String(50), server_default='PROCESSED'),
        sa.Column('total_rows', sa.Integer, nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )

    op.create_table(
        'portfolio_holding',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('upload_id', sa.BigInteger, nullable=True),
        sa.Column('report_month', sa.String(7), nullable=False),
        sa.Column('amfi_code', sa.String(50), nullable=False),
        sa.Column('scheme_name', sa.String(500), nullable=True),
        sa.Column('company_name', sa.String(500), nullable=False),
        sa.Column('company_isin', sa.String(50), nullable=True),
        sa.Column('sector', sa.String(255), nullable=True),
        sa.Column('quantity', sa.Numeric(24, 4), nullable=True),
        sa.Column('market_value_cr', sa.Numeric(20, 6), nullable=True),
        sa.Column('percentage_exposure', sa.Numeric(8, 4), nullable=True),
        sa.Column('security_class', sa.String(100), nullable=True),
        sa.Column('rating', sa.String(50), nullable=True),
        sa.Column('rating_agency', sa.String(100), nullable=True),
        sa.Column('avg_maturity_years', sa.Numeric(10, 4), nullable=True),
        sa.Column('modified_duration', sa.Numeric(10, 4), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Index('ix_ph_amfi_month', 'amfi_code', 'report_month'),
        sa.Index('ix_ph_month', 'report_month'),
        sa.Index('ix_ph_sector', 'sector'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )


def downgrade() -> None:
    op.drop_table('portfolio_holding')
    op.drop_table('portfolio_upload')
    for col in ['face_value', 'investment_objective', 'fund_manager_name', 'fund_manager_experience',
                'alternate_benchmark', 'min_investment_amount', 'additional_investment_amount',
                'sip_min_amount', 'dividend_frequency', 'maturity_type', 'exit_load', 'entry_load']:
        try:
            op.drop_column('scheme_master', col)
        except Exception:
            pass
    for col in ['nav_52w_high', 'nav_52w_low', 'sip_return_1y', 'sip_return_3y', 'sip_return_5y',
                'sharpe_ratio', 'beta', 'std_deviation']:
        try:
            op.drop_column('scheme_analytics_snapshot', col)
        except Exception:
            pass
