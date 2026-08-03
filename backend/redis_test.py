import asyncio
import aioredis
import redis.asyncio as redis

async def listen():
    r = redis.from_url('redis://127.0.0.1:6379')
    p = r.pubsub()
    await p.subscribe('hardware_commands')
    async for message in p.listen():
        print(message)

asyncio.run(listen())
