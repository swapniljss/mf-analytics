"""add fof_aum_cr to aum tables

Revision ID: f74b3ac8b7a7
Revises:
Create Date: 2026-04-08

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f74b3ac8b7a7'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add fof_aum_cr to average_aum_scheme (after average_aum_cr)
    op.add_column(
        'average_aum_scheme',
        sa.Column('fof_aum_cr', sa.Numeric(20, 6), nullable=True),
    )
    # Add fof_aum_cr to average_aum_fund (after total_aum_cr)
    op.add_column(
        'average_aum_fund',
        sa.Column('fof_aum_cr', sa.Numeric(20, 6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('average_aum_fund', 'fof_aum_cr')
    op.drop_column('average_aum_scheme', 'fof_aum_cr')
