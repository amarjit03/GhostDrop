# backend/app/db/smoke_test.py

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.settings import get_settings


async def main() -> None:
    settings = get_settings()

    # Create an async engine using the validated PostgreSQL URL.
    engine = create_async_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        echo=False,
    )

    try:
        # Open a connection and execute a simple query to verify connectivity.
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT 1"))
            value = result.scalar_one()

            if value != 1:
                raise RuntimeError("Unexpected result from PostgreSQL")

            # Avoid printing credentials or other sensitive configuration.
            print("PostgreSQL connection successful!")
            print(f"SELECT 1 returned: {value}")

    except Exception as exc:
        # Print the error type, not the connection URL or credentials.
        print(f"PostgreSQL connection failed: {type(exc).__name__}")
        raise

    finally:
        # Release connections and close the engine's connection pool.
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())