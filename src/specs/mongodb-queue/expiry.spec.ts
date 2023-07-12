import mongoDbQueue from '../../mynth-mongodb-queue';
import setupMongo from '../__helpers__/setup-mongo';
import sleep from '../__helpers__/sleep';

describe('expiry', () => {
  const queueName = 'testing-expiry-queue';
  const setupDb = setupMongo();

  beforeAll(async () => {
    jest.setTimeout(90 * 1000);
    await setupDb.connect();
  });

  afterEach(async () => {
    await setupDb.db.collection(queueName).deleteMany({});
  });

  afterAll(async () => {
    await setupDb.client?.close();
  });

  it('deletes expired messages from the queue', async () => {
    const queue = mongoDbQueue<string>(setupDb.db, queueName, { expiry: 2 });

    await queue.add('test message with expiry');

    let message = await queue.get({ visibility: 1 });
    expect(message).toBeDefined();

    // Wait for 1 second, message should still be visible
    await sleep(1000);

    message = await queue.get();
    expect(message).toBeDefined();

    // Wait for 2 more seconds, message should expire and be deleted from the queue
    await sleep(2000);

    message = await queue.get();
    expect(message).not.toBeDefined();
  });

  it('deleted delayed expired messages from the queue', async () => {
    const queue = mongoDbQueue<string>(setupDb.db, queueName, { expiry: 2 });

    await queue.add('test message with expiry', { delay: 1 });

    let message = await queue.get();
    expect(message).not.toBeDefined();

    // Wait for 1 second, message should now be visible
    await sleep(1000);

    message = await queue.get();
    expect(message).toBeDefined();

    // Wait for 2 more seconds, message should expire and be deleted from the queue
    await sleep(2000);

    message = await queue.get();
    expect(message).not.toBeDefined();
  });
});
