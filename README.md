# Kafka Microservices on Kubernetes - Proof of Concept

This project demonstrates a microservices architecture using Apache Kafka for asynchronous communication between services. The application consists of three microservices (Order, Billing, and Notification) that communicate through Kafka topics.

## Architecture

![Architecture Diagram](https://placeholder-for-architecture-diagram.png)

The system consists of the following components:

- **Order Service**: Creates orders and publishes events to Kafka
- **Billing Service**: Processes payments based on events from the Order Service
- **Notification Service**: Sends notifications to customers based on payment results
- **Kafka**: Message broker for asynchronous communication between services

The flow of events is:
1. Order Service creates an order and publishes to `order-created` topic
2. Order Service publishes payment request to `payment-requests` topic  
3. Billing Service consumes from `payment-requests` topic, processes payment
4. Billing Service publishes result to `notification-events` topic
5. Notification Service consumes from `notification-events` topic and notifies customer

## Prerequisites

- Kubernetes cluster (GKE or Minikube)
- kubectl configured to access your cluster
- Docker and container registry (if building your own images)
- Basic understanding of Kubernetes and Kafka

## Deployment Instructions

### 1. Create Namespace and Deploy Kafka

First, deploy Kafka and Zookeeper:

```bash
# Create namespace and deploy Kafka/Zookeeper
kubectl apply -f kafka-setup/namespace.yaml
kubectl apply -f kafka-setup/kafka.yaml

# Wait for Kafka and Zookeeper to be ready
kubectl -n kafka-poc get pods -w

# Create Kafka topics
kubectl apply -f kafka-setup/topics.yaml
```

### 2. Build and Push Docker Images

If you want to build your own images (or replace with pre-built images):

```bash
# Update image references in k8s deployment files
# Replace ${YOUR_REGISTRY} with your registry path

# Build and push Order Service
cd order-service
docker build --platform linux/arm64 -t ${YOUR_REGISTRY}/order-service:latest .
docker push ${YOUR_REGISTRY}/order-service:latest

# Build and push Billing Service
cd ../billing-service
docker build --platform linux/arm64 -t ${YOUR_REGISTRY}/billing-service:latest .
docker push ${YOUR_REGISTRY}/billing-service:latest

# Build and push Notification Service
cd ../notification-service
docker build --platform linux/arm64 -t ${YOUR_REGISTRY}/notification-service:latest .
docker push ${YOUR_REGISTRY}/notification-service:latest
```

### 3. Deploy Microservices

```bash
# Deploy all services
kubectl apply -f order-service/k8s-deployment.yaml
kubectl apply -f billing-service/k8s-deployment.yaml
kubectl apply -f notification-service/k8s-deployment.yaml

# Verify services are running
kubectl -n kafka-poc get pods
```

### 4. Expose Order Service (for testing)

```bash
# Create an external endpoint for the Order Service
kubectl -n kafka-poc patch svc order-service -p '{"spec": {"type": "LoadBalancer"}}'

# Get the external IP address
kubectl -n kafka-poc get svc order-service
```

### 5. Run Load Testing

Once all services are up and running:

```bash
# Run the load test job
cd k6-load-testing

# Get ORDER_SERVICE_URL
ORDER_SERVICE_URL=$(kubectl -n kafka-poc get svc order-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Update ORDER_SERVICE_URL in the command below with your Order Service endpoint
kubectl -n kafka-poc create job --from=cronjob/load-test load-test-manual \
  --env="ORDER_SERVICE_URL=http://$ORDER_SERVICE_URL/api/orders"

# View load test results
kubectl -n kafka-poc logs -f job/load-test-manual
```

Test result
```
█ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<500' p(95)=34.17ms

    http_req_failed
    ✓ 'rate<0.01' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......................: 10698   35.461786/s
    checks_succeeded...................: 100.00% 10698 out of 10698
    checks_failed......................: 0.00%   0 out of 10698

    ✓ Status is 202 Accepted
    ✓ Response has orderId

    HTTP
    http_req_duration.......................................................: avg=11ms  min=3.59ms med=6.44ms max=229.91ms p(90)=21.59ms p(95)=34.17ms
      { expected_response:true }............................................: avg=11ms  min=3.59ms med=6.44ms max=229.91ms p(90)=21.59ms p(95)=34.17ms
    http_req_failed.........................................................: 0.00%  0 out of 5349
    http_reqs...............................................................: 5349   17.730893/s

    EXECUTION
    iteration_duration......................................................: avg=1.26s min=505ms  med=1.25s  max=2.08s    p(90)=1.87s   p(95)=1.94s
    iterations..............................................................: 5349   17.730893/s
    vus.....................................................................: 1      min=1         max=50
    vus_max.................................................................: 50     min=50        max=50

    NETWORK
    data_received...........................................................: 3.8 MB 12 kB/s
    data_sent...............................................................: 2.7 MB 8.8 kB/s
```    

## Monitoring and Troubleshooting

### Checking Kafka Topics

You can check the messages in Kafka topics for debugging:

```bash
# Create a temporary pod to interact with Kafka
kubectl -n kafka-poc run kafka-client --rm -it --image=confluentinc/cp-kafka:7.3.12 -- bash

# Inside the pod, view messages in a topic
kafka-console-consumer --bootstrap-server kafka:9092 --topic order-created --from-beginning
```

### Service Logs

View the logs for each service:

```bash
# Get pod names first
kubectl -n kafka-poc get pods

# View logs for a specific pod
kubectl -n kafka-poc logs <pod-name>

# Follow logs live
kubectl -n kafka-poc logs -f <pod-name>
```

## Testing the System

You can manually test the system by creating an order:

```bash
# Get the Order Service endpoint
ORDER_SERVICE_URL=$(kubectl -n kafka-poc get svc order-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Create a test order
curl -X POST "http://$ORDER_SERVICE_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test-customer-123",
    "items": [
      {
        "productId": "product-abc",
        "name": "Test Product",
        "price": 49.99,
        "quantity": 2,
        "subtotal": 99.98
      }
    ],
    "totalAmount": 99.98
  }'
```

Check the logs of each service to see the events flowing through the system.

## Scaling the System

One of the key benefits of Kafka is scalability. You can scale the services:

```bash
# Scale a service
kubectl -n kafka-poc scale deployment order-service --replicas=3

# In a production environment, you would also scale Kafka brokers
```

## Cleaning Up

To remove all resources:

```bash
kubectl delete namespace kafka-poc
```

## What to Look For

When running this POC, observe the following to understand Kafka's benefits:

1. **Decoupling**: Services operate independently
2. **Resilience**: If the Billing Service goes down, orders are still accepted
3. **Scalability**: Multiple instances can process events in parallel
4. **Event Sourcing**: All events are persisted in Kafka
5. **Non-blocking Operations**: Services respond quickly and process in the background

## Extending the POC

Ideas for extending this proof of concept:

1. Add a Kafka UI (like Kafdrop) for monitoring topics
2. Implement dead-letter queues for failed processing
3. Add schema validation using Schema Registry
4. Implement event sourcing patterns
5. Add monitoring with Prometheus and Grafana

## Further Resources

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Confluent Kafka on Kubernetes](https://docs.confluent.io/operator/current/overview.html)
- [KafkaJS Documentation](https://kafka.js.org/docs/getting-started)
- [Kubernetes Documentation](https://kubernetes.io/docs/home/)
