// order-service/index.js
const express = require('express');
const { Kafka } = require('kafkajs');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

// Initialize Express
const app = express();
app.use(bodyParser.json());

// Initialize Kafka producer
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKERS || 'kafka:9092'],
});

const producer = kafka.producer();

// Connect to Kafka when the application starts
let connected = false;
async function connectToKafka() {
  try {
    await producer.connect();
    connected = true;
    console.log('Successfully connected to Kafka');
  } catch (error) {
    console.error('Failed to connect to Kafka:', error);
    // Retry connection after delay
    setTimeout(connectToKafka, 5000);
  }
}

connectToKafka();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(connected ? 200 : 503).json({
    status: connected ? 'UP' : 'DOWN',
    kafka: connected ? 'Connected' : 'Disconnected',
  });
});

// Create order endpoint
app.post('/api/orders', async (req, res) => {
  if (!connected) {
    return res.status(503).json({ error: 'Service unavailable, Kafka connection not established' });
  }

  try {
    const { customerId, items, totalAmount } = req.body;

    // Basic validation
    if (!customerId || !items || !Array.isArray(items) || items.length === 0 || !totalAmount) {
      return res.status(400).json({ error: 'Invalid order data' });
    }

    // Create order object
    const order = {
      orderId: uuidv4(),
      customerId,
      items,
      totalAmount,
      status: 'CREATED',
      createdAt: new Date().toISOString(),
    };

    // Log the order creation
    console.log(`Creating order ${order.orderId} for customer ${customerId}`);

    // Send order created event to Kafka
    await producer.send({
      topic: 'order-created',
      messages: [
        { 
          key: order.orderId, 
          value: JSON.stringify(order),
          headers: {
            'event-type': 'OrderCreated',
            'source': 'order-service',
          }
        },
      ],
    });

    // Send payment request event to Kafka
    await producer.send({
      topic: 'payment-requests',
      messages: [
        { 
          key: order.orderId, 
          value: JSON.stringify({
            orderId: order.orderId,
            customerId: order.customerId,
            amount: order.totalAmount,
            requestedAt: new Date().toISOString(),
          }),
          headers: {
            'event-type': 'PaymentRequested',
            'source': 'order-service',
          }
        },
      ],
    });

    console.log(`Order ${order.orderId} created and payment requested`);
    
    // Return the created order
    res.status(202).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to process order', details: error.message });
  }
});

// List orders endpoint (dummy implementation for the POC)
app.get('/api/orders', (req, res) => {
  res.status(200).json([
    {
      orderId: '8f7d9e6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f',
      customerId: 'customer123',
      totalAmount: 99.99,
      status: 'PAID',
      createdAt: '2023-11-01T12:34:56Z'
    }
  ]);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Order service listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received, closing HTTP server and Kafka producer');
  
  // Disconnect Kafka producer
  if (connected) {
    await producer.disconnect();
  }
  
  process.exit(0);
});
