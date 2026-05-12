"""Add dividend history table

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-04-23
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'dividend_history',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('amfi_code', sa.String(50), nullable=False),
        sa.Column('isin', sa.String(50), nullable=True),
        sa.Column('scheme_name', sa.String(500), nullable=True),
        sa.Column('record_date', sa.Date, nullable=False),
        sa.Column('ex_dividend_date', sa.Date, nullable=True),
        sa.Column('reinvestment_date', sa.Date, nullable=True),
        sa.Column('dividend_per_unit', sa.Numeric(18, 6), nullable=True),
        sa.Column('face_value', sa.Numeric(18, 4), nullable=True),
        sa.Column('nav_on_record_date', sa.Numeric(18, 6), nullable=True),
        sa.Column('dividend_yield', sa.Numeric(10, 6), nullable=True),
        sa.Column('dividend_type', sa.String(50), nullable=True),
        sa.Column('report_month', sa.String(7), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Index('ix_dh_amfi_date', 'amfi_code', 'record_date'),
        sa.Index('ix_dh_isin', 'isin'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )


def downgrade() -> None:
    op.drop_table('dividend_history')
