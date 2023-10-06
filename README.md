# Mynth MongoDB Queue

This is a lightweight tool designed for use with MongoDB. It helps create queues
with an easy-to-use API. This tool is a modified version of
[openwar/mongodb-queue](https://github.com/openwar/mongodb-queue). The original
version was developed based on
[chilts/mongodb-queue](https://github.com/chilts/mongodb-queue). However, this
version adopts a more contemporary approach, integrating promises and
TypeScript. It utilizes MongoDB’s atomic operations to guarantee message safety
and reliability.

## Getting started

Install using npm:

```bash
npm install mynth-mongodb-queue
```

Create a connection to your MongoDB database, and use it to create a queue
object:

```typescript
import { MongoClient } from 'mongodb';
import mongoDbQueue from 'mynth-mongodb-queue';

const url = 'mongodb://localhost:27017/';
const client = new MongoClient(url, { useUnifiedTopology: true });

await client.connect();

const db = client.db('test');
const queue = mongoDbQueue(db, 'my-queue');
```

Add a message to a queue:

```typescript
const id = await queue.add('Hello World!');
// Message with payload 'Hello World!' added.
// 'id' is returned, useful for logging.
```

Get a message from the queue:

```typescript
const msg = await queue.get();
console.log('msg.id %s', msg.id);
console.log('msg.ack %s', msg.ack);
console.log('msg.payload %o', msg.payload); // 'Hello, World!'
console.log('msg.tries %d', msg.tries);
```

Ping a message to keep its visibility open for long-running tasks:

```typescript
const id = await queue.ping(msg.ack);
// Visibility window now increased for this message id.
// 'id' is returned, useful for logging.
```

Ack a message (and remove it from the queue):

```typescript
const id = queue.ack(msg.ack);
// This msg removed from queue for this ack.
// The 'id' of the message is returned, useful for logging.
```

If you haven’t already, you should call this to make sure indexes have been
added in MongoDB. Of course, if you’ve called this once (in some kind one-off
script) you don’t need to call it in your program.

```typescript
await queue.createIndexes();
```

## Creating a Queue

To create a queue, call the exported function with the `MongoClient`, the name
and a set of options. The MongoDB collection used is the same name as the name
passed in:

```typescript
import mongoDbQueue from 'mynth-mongodb-queue';

// an instance of a queue
const queue = mongoDbQueue(db, 'queue');
```

To pass in options for the queue:

```typescript
const resizeQueue = mongoDbQueue(db, 'resize-queue', {
  visibility: 30,
});
```

This example shows a queue with a message visibility of 30 seconds.

## Options

### name

This is the name of the MongoDB Collection you wish to use to store the
messages. Each queue you create will be it’s own collection.

e.g.

```typescript
const resizeImageQueue = mongoDbQueue(db, 'resize-image-queue');
const notifyOwnerQueue = mongoDbQueue(db, 'notify-owner-queue');
```

This will create two collections in MongoDB called `resize-image-queue` and
`notify-owner-queue`.

While using 2 instances of the same queue name won’t interfere with each other
and will play along nicely, it is not advisable. Instead please use the same
instance in your code. This is specially important if you use different options
for the queue, since it might lead to inconsistent behavior.

### visibility - Message Visibility Window in seconds

Default: `30`

By default, if you don’t acknowledge a message within the first 30 seconds after
receiving it, it is placed back in the queue so it can be fetched again. This is
called the visibility window.

You may set this visibility window on a per queue basis. For example, to set the
visibility to 15 seconds:

```typescript
const queue = mongoDbQueue(db, 'queue', { visibility: 15 });
```

All messages in this queue now have a visibility window of 15 seconds, instead
of the default 30 seconds.

## Operations

### .add()

You can add a `string` to the queue:

```typescript
const id = await queue.add('Hello, World!');
// Message with payload 'Hello, World!' added.
// 'id' is returned, useful for logging.
```

Or add an object of your choosing:

```typescript
const id = await queue.add({ err: 'E_BORKED', msg: 'Broken' });
// Message with payload `{ err: 'E_BORKED', msg: 'Broken' }` added.
// 'id' is returned, useful for logging.
```

Or add array as a message:

```typescript
const id = await queue.add(['msg1', 'msg2', 'msg3']);
// Message with payload `['msg1', 'msg2', 'msg3']` added.
// 'id' is returned, useful for logging.
```

You can delay individual messages from being visible until a certain period has
elapsed. Use the optional `delay` parameter to only process this message in the
future. This is useful if you need to schedule an event to be processed in a
regular interval or at a certain point in time.

```typescript
const payload = {
  id: 'msg',
  msg: 'This will only be visible 100 seconds from now',
};
const id = await queue.add(payload, { delay: 120 });
// Message will not be available to `get` for 2 minutes.
// 'id' is returned, useful for logging.
```

In case your messages can be duplicated (like events that occur multiple times
in a short period), you can use the optional `hashKey` parameter to prevent this
event from being duplicated in the queue. This is extremely useful if you are
doing notifications or handling events from external sources (like webhooks).

```typescript
const payload = { id: 'msg1', msg: 'Possible duplicated message' };
const id1 = await queue.add(payload, { hashKey: 'id' });
const id2 = await queue.add(payload, { hashKey: 'id' });
// Only one Message with `payload` added.
// 'id1' is the same as 'id2', and it is useful for logging.
```

In case your message doesn’t have an idempotent key, you can easily generate one
and append it to your payload.

```typescript
import crypto from 'crypto';

const payload = { id: 'msg1', msg: 'Possible duplicated message' };
const hash = crypto
  .createHash('sha1')
  .update(JSON.stringify(payload))
  .digest('hex');

const hash = crypto.createHash('sha1');
const id1 = await queue.add({ ...payload, hash }, { hashKey: 'hash' });
const id2 = await queue.add({ ...payload, hash }, { hashKey: 'hash' });
// Only one Message with `payload` added.
// 'id1' is the same as 'id2', and it is useful for logging.
```

In case your messages are just list of ids that should be unique (e.g: users to
process based on some event based queue), you can easily pass the payload as the
`hashKey`.

```typescript
const payload = 'some-unique-id';
const id1 = await queue.add(payload, { hashKey: payload });
const id2 = await queue.add(payload, { hashKey: payload });
// Only one Message with `payload` added.
// 'id1' is the same as 'id2', and it is useful for logging.
```

It will also work with numbers for those of you that still use integers/longs
for ids.

```typescript
const payload = 123456789;
const id1 = await queue.add(payload, { hashKey: payload });
const id2 = await queue.add(payload, { hashKey: payload });
// Only one Message with `payload` added.
// 'id1' is the same as 'id2', and it is useful for logging.
```

### .get()

Retrieve a message from the queue:

```typescript
const msg = await queue.get();
// You can now process the message
// The message will be `undefined` if the queue is empty.
```

You can choose the visibility of an individual retrieved message by passing the
`visibility` option:

```typescript
const msg = await queue.get({ visibility: 10 });
// You can now process the message for 10 seconds before it goes back into the
// queue if not acknowledged, instead of the duration that is set on the queue
// in general
```

Message will have the following structure:

```typescript
{
  // ID of the message
  id: '533b1eb64ee78a57664cc76c',
  // ID for ack and ping operations
  ack: 'c8a3cc585cbaaacf549d746d7db72f69',
  // Payload passed when the message was added
  payload: 'Hello, World!',
  // Number of times this message has been retrieved from queue without being
  // acknowledged
  tries: 1,
}
```

### .ack()

After you have received an item from a queue and processed it, you can delete it
by calling `.ack()` with the unique `ack` id returned from the message:

```typescript
const msg = await queue.get();
// process the message
const id = await queue.ack(msg.ack);
// this message has now been removed from the queue
```

### .ping()

After you have received an item from a queue and you are taking a while to
process it, you can `.ping()` the message to tell the queue that you are still
alive and continuing to process the message:

```typescript
const msg = await queue.get();
// some partial processing of the message...
const id = await queue.ping(msg.ack);
// this message has had it's visibility window extended
// keep processing the message
```

You can also choose the visibility time that gets added by the ping operation by
passing the `visibility` option:

```typescript
const msg = await queue.get();
const id = await queue.ping(msg.ack, { visibility: 10 });
// this message has had its visibility window extended by 10 seconds instead of
// the visibility set by the queue in general
```

### .total()

Returns the total number of messages that has ever been in the queue, including
all current messages:

```typescript
const count = queue.total();
console.log('This queue has seen %d messages', count);
```

### .size()

Returns the total number of messages that are waiting in the queue.

```typescript
const count = queue.size();
console.log('This queue has %d current messages', count);
```

### .inFlight()

Returns the total number of messages that are currently in flight. i.e. that
have been received but not yet acknowledged:

```typescript
const count = queue.inFlight();
console.log('A total of %d messages are currently being processed', count);
```

### .done()

Returns the total number of messages that have been processed correctly in the
queue:

```typescript
const queue.done();
console.log('This queue has processed %d messages', count);
```

### Notes about stats numbers

If you add up `.size() + .inFlight() + .done()` then you should get `.total()`,
but this will only be approximate since these are different operations hitting
the database at slightly different times. Hence, a message or two might be
counted twice or not at all depending on message turnover at any one time. You
should not rely on these numbers for anything, but are included as
approximations at any point in time for stats or health monitoring of the queue.
