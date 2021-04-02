import mongoDbQueue from '../mongodb-queue';
import setupMongo from './__helpers__/setup-mongo';
import sleep from './__helpers__/sleep';

describe('mongodb-queue', () => {
  const queueName = 'testing-default-queue';
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

  it('should return `undefined` when getting a message from empty queue', async () => {
    const queue = mongoDbQueue(setupDb.db, queueName);

    expect(await queue.get()).toBeUndefined();
  });

  it('should handle single round trip message', async () => {
    const queue = mongoDbQueue<string>(setupDb.db, queueName);

    const messageId = await queue.add('test message');

    expect(messageId).toBeDefined();

    const message = await queue.get();

    expect(message.id).toBeDefined();
    expect(typeof message.id).toBe('string');
    expect(message.ack).toBeDefined();
    expect(typeof message.ack).toBe('string');
    expect(message.createdAt).toBeDefined();
    expect(message.createdAt).toBeInstanceOf(Date);
    expect(message.updatedAt).toBeDefined();
    expect(message.updatedAt).toBeInstanceOf(Date);
    expect(message.tries).toBeDefined();
    expect(typeof message.tries).toBe('number');
    expect(message.tries).toBe(1);
    expect(message.occurrences).toBe(1);
    expect(message.payload).toBe('test message');

    const id = await queue.ack(message.ack);
    expect(id).toBeDefined();
  });

  it('should not allow an message to be acknowledged twice', async () => {
    const queue = mongoDbQueue<string>(setupDb.db, queueName);

    await queue.add('test message');
    const message = await queue.get();
    await queue.ack(message.ack);

    await expect(queue.ack(message.ack)).rejects.toThrow(
      /^Queue.ack\(\): Unidentified ack : (.+)$/,
    );
  });

  it('should retry messages', async () => {
    const queue = mongoDbQueue<string>(setupDb.db, queueName);

    await queue.add('test message for retry');

    const messageToIgnore = await queue.get({ visibility: 1 });

    await sleep(1500);

    const message = await queue.get();

    expect(messageToIgnore.tries).toBe(1);
    expect(message.tries).toBe(2);

    expect(message.id).toBe(messageToIgnore.id);
    expect(message.payload).toBe('test message for retry');
    expect(message.payload).toBe(messageToIgnore.payload);

    const id = await queue.ack(message.ack);

    expect(id).toBeDefined();
  });

  it('should throw when not passing a db', () => {
    // @ts-expect-error testing without required db param
    expect(() => mongoDbQueue()).toThrow(
      /^Please provide a mongodb.MongoClient.db$/,
    );
  });

  it('should throw when not passing a valid queue name', () => {
    // @ts-expect-error testing without required queue name param
    expect(() => mongoDbQueue(setupDb.db)).toThrow(
      /^Please provide a queue name$/,
    );
    expect(() => mongoDbQueue(setupDb.db, '')).toThrow(
      /^Please provide a queue name$/,
    );
  });

  describe('payloads', () => {
    it('should allow string', async () => {
      const queue = mongoDbQueue<string>(setupDb.db, queueName);

      await queue.add('test message');

      const message = await queue.get();

      expect(message.payload).toEqual('test message');
    });

    it('should allow number', async () => {
      const queue = mongoDbQueue<number>(setupDb.db, queueName);

      await queue.add(12);

      const message = await queue.get();

      expect(message.payload).toEqual(12);
    });

    it('should allow boolean', async () => {
      const queue = mongoDbQueue<boolean>(setupDb.db, queueName);

      await queue.add(false);

      expect((await queue.get()).payload).toEqual(false);

      await queue.add(true);

      expect((await queue.get()).payload).toEqual(true);
    });

    it('should allow object', async () => {
      type Complex = { something: string };

      const queue = mongoDbQueue<Complex>(setupDb.db, queueName);

      const payload = { something: 'complex' };
      await queue.add(payload);

      const message = await queue.get();

      expect(message.payload).toEqual({ something: 'complex' });
      expect(message.payload).not.toBe(payload);
    });

    it('should allow array', async () => {
      type Complex = string | { test: string };

      const queue = mongoDbQueue<Complex[]>(setupDb.db, queueName);

      const payload = ['test message', { test: 'message' }];
      await queue.add(payload);

      const message = await queue.get();

      expect(message.payload).toEqual(['test message', { test: 'message' }]);
      expect(message.payload).not.toBe(payload);
    });
  });

  describe('duplicated messages', () => {
    it.each`
      value
      ${'test message'}
      ${''}
    `(
      'should allow string - `$value`',
      async ({ value }: { value: string }) => {
        const queue = mongoDbQueue<string>(setupDb.db, queueName);

        const payload = value;

        const messageId1 = await queue.add(payload, payload);
        const messageId2 = await queue.add(payload, payload);

        expect(messageId1).toBeDefined();
        expect(messageId2).toBeDefined();
        expect(messageId2).toBe(messageId1);
        expect((await queue.get()).occurrences).toBe(2);
        expect(await queue.size()).toBe(0);
      },
    );

    it.each`
      value
      ${0}
      ${10}
      ${-20}
    `(
      'should allow number - `$value`',
      async ({ value }: { value: number }) => {
        const queue = mongoDbQueue<number>(setupDb.db, queueName);

        const payload = value;

        const messageId1 = await queue.add(payload, payload);
        const messageId2 = await queue.add(payload, payload);

        expect(messageId1).toBeDefined();
        expect(messageId2).toBeDefined();
        expect(messageId2).toBe(messageId1);
        expect((await queue.get()).occurrences).toBe(2);
        expect(await queue.size()).toBe(0);
      },
    );

    it.each`
      value
      ${true}
      ${false}
    `(
      'should allow boolean - `$value`',
      async ({ value }: { value: boolean }) => {
        const queue = mongoDbQueue<boolean>(setupDb.db, queueName);

        const payload = value;

        const messageId1 = await queue.add(payload, payload);
        const messageId2 = await queue.add(payload, payload);

        expect(messageId1).toBeDefined();
        expect(messageId2).toBeDefined();
        expect(messageId2).toBe(messageId1);
        expect((await queue.get()).occurrences).toBe(2);
        expect(await queue.size()).toBe(0);
      },
    );

    it.each`
      value                                | hashKey
      ${{ something: 'complex' }}          | ${'something'}
      ${{ id: 'id1', value: 'something' }} | ${'id1'}
      ${{ id: 'id2', value: 'something' }} | ${'value'}
    `(
      'should allow object - `$value` : `$hashKey`',
      async ({ value, hashKey }) => {
        const queue = mongoDbQueue(setupDb.db, queueName);

        const payload = value;

        const messageId1 = await queue.add(payload, hashKey);
        const messageId2 = await queue.add(payload, hashKey);

        expect(messageId1).toBeDefined();
        expect(messageId2).toBeDefined();
        expect(messageId2).toBe(messageId1);
        expect((await queue.get()).occurrences).toBe(2);
        expect(await queue.size()).toBe(0);
      },
    );
  });

  describe('createIndexes', () => {
    beforeEach(async () => {
      await setupDb.db.dropCollection(queueName);
    });

    it('should create indexes on collection', async () => {
      const queue = mongoDbQueue<string>(setupDb.db, queueName);
      // create an message to make sure collection exists in the system
      await queue.add('test message');

      expect(
        await setupDb.db.collection(queueName).indexInformation(),
      ).toMatchSnapshot();

      await queue.createIndexes();

      expect(
        await setupDb.db.collection(queueName).indexInformation(),
      ).toMatchSnapshot();
    });
  });

  describe('parallel messages processing', () => {
    const total = 25;

    it('should handle multiple parallel processes', async () => {
      const queue = mongoDbQueue<string>(setupDb.db, queueName);

      const messageIdPromises = [];

      for (let i = 0; i < total; i++) {
        messageIdPromises.push(queue.add('test message'));
      }

      const messageIds = await Promise.all(messageIdPromises);

      expect(messageIds).toHaveLength(total);

      const messages = await Promise.all(
        messageIds.map(async () => await queue.get()),
      );

      expect(messages).toHaveLength(total);

      await Promise.all(
        messages.map(async (message) => await queue.ack(message.ack)),
      );
    });

    it('should show correct stats based on current state', async () => {
      const queue = mongoDbQueue<string>(setupDb.db, queueName);

      const messageIdPromises = [];

      for (let i = 0; i < total; i++) {
        messageIdPromises.push(queue.add('test message'));
      }

      const messageIds = await Promise.all(messageIdPromises);

      expect(messageIds).toHaveLength(total);
      expect(await queue.size()).toBe(25);
      expect(await queue.total()).toBe(25);
      expect(await queue.inFlight()).toBe(0);
      expect(await queue.done()).toBe(0);

      const messages = await Promise.all(
        messageIds.map(async () => await queue.get()),
      );

      expect(messages).toHaveLength(total);
      expect(await queue.size()).toBe(0);
      expect(await queue.total()).toBe(25);
      expect(await queue.inFlight()).toBe(25);
      expect(await queue.done()).toBe(0);

      await Promise.all(
        messages.map(async (message) => await queue.ack(message.ack)),
      );

      expect(await queue.size()).toBe(0);
      expect(await queue.total()).toBe(25);
      expect(await queue.inFlight()).toBe(0);
      expect(await queue.done()).toBe(25);
    });
  });
});
