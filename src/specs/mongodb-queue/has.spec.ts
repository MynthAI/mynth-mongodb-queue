import mongoDbQueue from '../../mynth-mongodb-queue';
import setupMongo from '../__helpers__/setup-mongo';

describe('delay', () => {
  const queueName = 'testing-has-queue';
  const setupDb = setupMongo();

  beforeAll(async () => {
    await setupDb.connect();
  });

  afterEach(async () => {
    await setupDb.db.collection(queueName).deleteMany({});
  });

  afterAll(async () => {
    await setupDb.client?.close();
  });

  it('validates if the payload is present in the queue', async () => {
    const queue = mongoDbQueue(setupDb.db, queueName);
    const payload = {
      title: 'Test message',
      desc: 'Test message desc',
    };
    await queue.add(payload);

    expect(await queue.has(payload)).toBe(true);
  });

  it('validates if a payload with given property is present in the queue', async () => {
    const queue = mongoDbQueue(setupDb.db, queueName);
    const payload = {
      title: 'Test message',
      desc: 'Test message desc',
    };
    await queue.add(payload);

    expect(await queue.has(payload.title, 'title')).toBe(true);
    expect(await queue.has(payload.desc, 'desc')).toBe(true);
  });
});
