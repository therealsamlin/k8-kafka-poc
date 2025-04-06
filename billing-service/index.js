// billing-service/index.js
const express = require('express');
const { Kafka } = require('kafkajs');

// Initialize Express for health checks
const app = express();

// Initialize Kafka client
const kafka = new Kafka({
  clientId: 'billing-service',
  brokers: [process.env.KAFKA_BROKERS || 'kafka:9092'],
});

// Create consumer and producer
const consumer = kafka.consumer({ groupId: 'billing-service-group' });
const producer = kafka.producer();

// Connection state
let connected = false;

// Function to simulate payment processing
async function processPayment(paymentData) {
  // Simulate payment processing time
  const processingTime = Math.floor(Math.random() * 1000) + 500;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Simulate success rate (95% success)
  const success = Math.random() < 0.95;
  
  return {
    success,
    processingTime,
    transactionId: success ? `txn-${Date.now()}` : null,
    errorMessage: success ? null : 'Payment processing failed',
  };
}

// Connect to Kafka and start consuming messages
async function connectAndConsume() {
  try {
    // Connect consumer and producer
    await consumer.connect();
    await producer.connect();
    
    // Subscribe to payment-requests topic
    await consumer.subscribe({ topic: 'payment-requests', fromBeginning: false });
    
    console.log('Connected to Kafka, subscribed to payment-requests topic');
    connected = true;
    
    // Process messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const paymentRequest = JSON.parse(message.value.toString());
          const orderId = paymentRequest.orderId;
          
          console.log(`Processing payment for order ${orderId}: $${paymentRequest.amount}`);
          
          // Process the payment
          const paymentResult = await processPayment(paymentRequest);
          
          // Create notification event based on payment result
          const notificationEvent = {
            orderId: orderId,
            customerId: paymentRequest.customerId,
            success: paymentResult.success,
            amount: paymentRequest.amount,
            transactionId: paymentResult.transactionId,
            message: paymentResult.success 
              ? `Payment of $${paymentRequest.amount} processed successfully` 
              : `Payment failed: ${paymentResult.errorMessage}`,
            timestamp: new Date().toISOString(),
          };
          
          // Send notification event to Kafka
          await producer.send({
            topic: 'notification-events',
            messages: [
              { 
                key: orderId, 
                value: JSON.stringify(notificationEvent),
                headers: {
                  'event-type': paymentResult.success ? 'PaymentSucceeded' : 'PaymentFailed',
                  'source': 'billing-service',
                }
              },
            ],
          });
          
          console.log(`Payment for order ${orderId} processed: ${paymentResult.success ? 'SUCCESS' : 'FAILED'}`);
          
        } catch (error) {
          console.error('Error processing payment message:', error);
        }
      },
    });
  } catch (error) {
    console.error('Failed to connect to Kafka:', error);
    connected = false;
    // Retry connection after delay
    setTimeout(connectAndConsume, 5000);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(connected ? 200 : 503).json({
    status: connected ? 'UP' : 'DOWN',
    kafka: connected ? 'Connected' : 'Disconnected',
  });
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Billing service health check listening on port ${PORT}`);
  
  // Connect to Kafka and start consuming
  connectAndConsume().catch(error => {
    console.error('Failed to start consumer:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received, shutting down gracefully');
  try {
    await consumer.disconnect();
    await producer.disconnect();
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
  }
  process.exit(0);
});
