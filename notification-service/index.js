// notification-service/index.js
const express = require('express');
const { Kafka } = require('kafkajs');

// Initialize Express for health checks
const app = express();

// Initialize Kafka client
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: [process.env.KAFKA_BROKERS || 'kafka:9092'],
});

// Create consumer
const consumer = kafka.consumer({ groupId: 'notification-service-group' });

// Connection state
let connected = false;

// In-memory store of sent notifications (for demo purposes only)
const sentNotifications = [];

// Function to simulate sending a notification
async function sendNotification(notificationData) {
  // Simulate notification sending time
  const processingTime = Math.floor(Math.random() * 300) + 100;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Simulate different notification channels
  let channel;
  if (notificationData.success) {
    // For successful payments, use email
    channel = 'email';
  } else {
    // For failed payments, use SMS for urgent attention
    channel = 'sms';
  }
  
  // Create notification record
  const notification = {
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    customerId: notificationData.customerId,
    orderId: notificationData.orderId,
    channel,
    message: notificationData.message,
    sentAt: new Date().toISOString(),
    deliveryStatus: 'SENT'
  };
  
  // Store the notification (in a real system, this would go to a database)
  sentNotifications.push(notification);
  
  // Just to keep our demo data manageable
  if (sentNotifications.length > 100) {
    sentNotifications.shift(); // Remove oldest notification
  }
  
  return notification;
}

// Connect to Kafka and start consuming messages
async function connectAndConsume() {
  try {
    // Connect consumer
    await consumer.connect();
    
    // Subscribe to notification-events topic
    await consumer.subscribe({ topic: 'notification-events', fromBeginning: false });
    
    console.log('Connected to Kafka, subscribed to notification-events topic');
    connected = true;
    
    // Process messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const notificationEvent = JSON.parse(message.value.toString());
          const orderId = notificationEvent.orderId;
          
          console.log(`Sending notification for order ${orderId} to customer ${notificationEvent.customerId}`);
          
          // Send the notification
          const sentNotification = await sendNotification(notificationEvent);
          
          console.log(`Notification sent for order ${orderId} via ${sentNotification.channel}`);
          
        } catch (error) {
          console.error('Error processing notification message:', error);
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

// API endpoint to get recent notifications (for demo purposes)
app.get('/api/notifications', (req, res) => {
  res.status(200).json(sentNotifications);
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notification service listening on port ${PORT}`);
  
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
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
  }
  process.exit(0);
});
