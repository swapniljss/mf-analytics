"""update market cap tables with actual AMFI column structure

Revision ID: a3c9e1b72d44
Revises: f74b3ac8b7a7
Create Date: 2026-04-08

Adds exchange-specific market cap columns and removes legacy columns
that didn't match the actual AMFI Excel format.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a3c9e1b72d44'
down_revision: Union[str, None] = 'f74b3ac8b7a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add title column to upload table
    op.add_column('market_cap_categorization_upload',
                  sa.Column('title', sa.String(500), nullable=True))
    op.alter_column('market_cap_categorization_upload', 'source_filename',
                    type_=sa.String(500), existing_nullable=False)

    # Drop legacy columns that don't match the actual file
    for col in ('security_name', 'sector_name', 'raw_json'):
        try:
            op.drop_column('market_cap_categorization_row', col)
        except Exception:
            pass  # column may not exist on fresh DB

    # Add new exchange-specific columns
    op.add_column('market_cap_categorization_row',
                  sa.Column('bse_symbol', sa.String(50), nullable=True))
    op.add_column('market_cap_categorization_row',
                  sa.Column('bse_market_cap_cr', sa.Numeric(20, 4), nullable=True))
    op.add_column('market_cap_categorization_row',
                  sa.Column('nse_symbol', sa.String(50), nullable=True))
    op.add_column('market_cap_categorization_row',
                  sa.Column('nse_market_cap_cr', sa.Numeric(20, 4), nullable=True))
    op.add_column('market_cap_categorization_row',
                  sa.Column('msei_symbol', sa.String(50), nullable=True))
    op.add_column('market_cap_categorization_row',
                  sa.Column('msei_market_cap_cr', sa.Numeric(20, 4), nullable=True))
    op.add_column('market_cap_categorization_row',
                  sa.Column('avg_market_cap_cr', sa.Numeric(20, 4), nullable=True))

    # Widen company_name to 500
    op.alter_column('market_cap_categorization_row', 'company_name',
                    type_=sa.String(500), existing_nullable=False)


def downgrade() -> None:
    for col in ('bse_symbol', 'bse_market_cap_cr', 'nse_symbol', 'nse_market_cap_cr',
                'msei_symbol', 'msei_market_cap_cr', 'avg_market_cap_cr'):
        op.drop_column('market_cap_categorization_row', col)
    op.drop_column('market_cap_categorization_upload', 'title')
