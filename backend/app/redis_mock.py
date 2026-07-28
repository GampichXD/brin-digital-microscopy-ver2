import asyncio
import json

class MockPubSub:
    def __init__(self, broker):
        self.broker = broker
        self.channels = set()
        self.queue = asyncio.Queue()

    async def subscribe(self, *channels):
        for c in channels:
            self.channels.add(c)
            if c not in self.broker.queues:
                self.broker.queues[c] = []
            self.broker.queues[c].append(self.queue)

    async def unsubscribe(self, *channels):
        for c in channels:
            if c in self.channels:
                self.channels.remove(c)
            if c in self.broker.queues and self.queue in self.broker.queues[c]:
                self.broker.queues[c].remove(self.queue)

    async def listen(self):
        while True:
            msg = await self.queue.get()
            yield msg

    async def close(self):
        await self.unsubscribe(*self.channels)

class MockRedis:
    def __init__(self):
        self.queues = {}

    async def publish(self, channel, message):
        if channel in self.queues:
            # Ensure message is bytes or string as per redis standards
            msg_data = message.encode('utf-8') if isinstance(message, str) else message
            msg = {"type": "message", "data": msg_data}
            for q in self.queues[channel]:
                await q.put(msg)

    def pubsub(self):
        return MockPubSub(self)

    async def close(self):
        pass

# Global instance so all connections share the same pub/sub queues
mock_redis_instance = MockRedis()

async def get_redis_client(redis_url: str):
    try:
        from redis import asyncio as aioredis
        import socket
        
        # Fast check if port 6379 is open before trying aioredis
        host = redis_url.split("://")[1].split(":")[0]
        port = int(redis_url.split(":")[2].split("/")[0]) if ":" in redis_url.split("://")[1] else 6379
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.1)
        s.connect((host, port))
        s.close()
        
        return await aioredis.from_url(redis_url)
    except Exception as e:
        # print(f"[REDIS MOCK] Redis server not found, falling back to in-memory MockRedis.")
        return mock_redis_instance
