"""Add advanced analytics metrics to snapshot

Revision ID: e3f4a5b6c7d8
Revises: d1e2f3a4b5c6
Create Date: 2026-04-23
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for col, typ in [
        ('max_drawdown',     sa.Numeric(10, 6)),
        ('sortino_ratio',    sa.Numeric(10, 6)),
        ('calmar_ratio',     sa.Numeric(10, 6)),
        ('var_95',           sa.Numeric(10, 6)),
        ('category_rank',    sa.Integer),
        ('category_count',   sa.Integer),
        ('category_quartile', sa.Integer),
    ]:
        try:
            op.add_column('scheme_analytics_snapshot', sa.Column(col, typ, nullable=True))
        except Exception:
            pass


def downgrade() -> None:
    for col in ['max_drawdown', 'sortino_ratio', 'calmar_ratio', 'var_95',
                'category_rank', 'category_count', 'category_quartile']:
        try:
            op.drop_column('scheme_analytics_snapshot', col)
        except Exception:
            pass
