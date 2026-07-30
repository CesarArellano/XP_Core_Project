# architecture-patterns — detailed patterns and worked examples

## Clean Architecture — Directory Structure

```
src/
├── domain/           # Entities, value objects, interfaces
│   ├── entities/
│   │   ├── user.ts
│   │   └── order.ts
│   ├── value-objects/
│   │   ├── email.ts
│   │   └── money.ts
│   └── interfaces/   # Abstract ports (no implementations)
│       ├── user-repository.ts
│       └── payment-gateway.ts
├── use-cases/        # Application business rules
│   ├── create-user.ts
│   ├── process-order.ts
│   └── send-notification.ts
├── adapters/         # Concrete implementations
│   ├── repositories/
│   │   ├── postgres-user.repository.ts
│   │   └── redis-cache.repository.ts
│   ├── controllers/
│   │   └── user.controller.ts
│   └── gateways/
│       ├── stripe-payment.gateway.ts
│       └── sendgrid-email.gateway.ts
└── infrastructure/   # Framework wiring, config, DI container
    ├── database.ts
    ├── config.ts
    └── logging.ts
```

**Dependency rule in one sentence:** every `import` statement in `domain/` and `use-cases/` must point only toward `domain/`; nothing in those layers may import from `adapters/` or `infrastructure/`.

## Clean Architecture — Core Implementation

```ts
// domain/entities/user.ts
export class User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: Date;
  isActive: boolean;

  constructor(params: { id: string; email: string; name: string; createdAt: Date; isActive?: boolean }) {
    this.id = params.id;
    this.email = params.email;
    this.name = params.name;
    this.createdAt = params.createdAt;
    this.isActive = params.isActive ?? true;
  }

  deactivate(): void {
    this.isActive = false;
  }

  canPlaceOrder(): boolean {
    return this.isActive;
  }
}


// domain/interfaces/user-repository.ts
// Port: defines the contract, no implementation details.
import type { User } from '../entities/user.ts';

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(userId: string): Promise<boolean>;
}


// use-cases/create-user.ts
// Use case: orchestrates business logic, no HTTP or DB details.
import { randomUUID } from 'node:crypto';
import { User } from '../domain/entities/user.ts';
import type { UserRepository } from '../domain/interfaces/user-repository.ts';

export interface CreateUserRequest {
  email: string;
  name: string;
}

export interface CreateUserResponse {
  user: User | null;
  success: boolean;
  error?: string;
}

export class CreateUserUseCase {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute(request: CreateUserRequest): Promise<CreateUserResponse> {
    const existing = await this.userRepository.findByEmail(request.email);
    if (existing) {
      return { user: null, success: false, error: 'Email already exists' };
    }

    const user = new User({
      id: randomUUID(),
      email: request.email,
      name: request.name,
      createdAt: new Date(),
    });
    const savedUser = await this.userRepository.save(user);
    return { user: savedUser, success: true };
  }
}


// adapters/repositories/postgres-user.repository.ts
// Adapter: PostgreSQL implementation of the user port.
import type { Pool } from 'pg';
import type { UserRepository } from '../../domain/interfaces/user-repository.ts';
import { User } from '../../domain/entities/user.ts';

export class PostgresUserRepository implements UserRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(userId: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async save(user: User): Promise<User> {
    await this.pool.query(
      `INSERT INTO users (id, email, name, created_at, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET email = $2, name = $3, is_active = $5`,
      [user.id, user.email, user.name, user.createdAt, user.isActive],
    );
    return user;
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    return result.rowCount === 1;
  }

  private toEntity(row: Record<string, any>): User {
    return new User({
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      isActive: row.is_active,
    });
  }
}


// adapters/controllers/user.controller.ts
// Controller handles HTTP only — no business logic lives here.
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CreateUserUseCase } from '../../use-cases/create-user.ts';

export const createUserController = (useCase: CreateUserUseCase): Router => {
  const router = Router();

  // Express 5 forwards rejected promises to the error middleware automatically —
  // no try/catch + next(err) needed here.
  router.post('/users', async (req: Request, res: Response) => {
    const response = await useCase.execute({ email: req.body.email, name: req.body.name });
    if (!response.success) {
      res.status(400).json({ error: response.error });
      return;
    }
    res.status(201).json({ user: response.user });
  });

  return router;
};
```

## Hexagonal Architecture — Ports and Adapters

```ts
// Core domain service — no infrastructure dependencies
export class OrderService {
  private orders: OrderRepositoryPort;
  private payments: PaymentGatewayPort;
  private notifications: NotificationPort;

  constructor(
    orderRepository: OrderRepositoryPort,
    paymentGateway: PaymentGatewayPort,
    notificationService: NotificationPort,
  ) {
    this.orders = orderRepository;
    this.payments = paymentGateway;
    this.notifications = notificationService;
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    if (!order.isValid()) {
      return { success: false, error: 'Invalid order' };
    }

    const payment = await this.payments.charge(order.total, order.customerId);
    if (!payment.success) {
      return { success: false, error: 'Payment failed' };
    }

    order.markAsPaid();
    const savedOrder = await this.orders.save(order);
    await this.notifications.send(
      order.customerEmail,
      'Order confirmed',
      `Order ${order.id} confirmed`,
    );
    return { success: true, order: savedOrder };
  }
}


// Ports (driving and driven interfaces)
export interface OrderRepositoryPort {
  save(order: Order): Promise<Order>;
}

export interface PaymentGatewayPort {
  charge(amount: Money, customer: string): Promise<PaymentResult>;
}

export interface NotificationPort {
  send(to: string, subject: string, body: string): Promise<void>;
}


// Production adapter: Stripe
import Stripe from 'stripe';

export class StripePaymentAdapter implements PaymentGatewayPort {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey);
  }

  async charge(amount: Money, customer: string): Promise<PaymentResult> {
    try {
      const charge = await this.stripe.charges.create({
        amount: amount.cents,
        currency: amount.currency,
        customer,
      });
      return { success: true, transactionId: charge.id };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}


// Test adapter: no external dependencies
export class MockPaymentAdapter implements PaymentGatewayPort {
  async charge(): Promise<PaymentResult> {
    return { success: true, transactionId: 'mock-txn-123' };
  }
}
```

## DDD — Value Objects and Aggregates

```ts
// Value Objects: immutable, validated at construction
export class Email {
  readonly value: string;

  constructor(value: string) {
    const [, domain] = value.split('@');
    if (!domain || !domain.includes('.')) {
      throw new Error(`Invalid email: ${value}`);
    }
    this.value = value;
  }
}

export class Money {
  readonly amount: number; // cents
  readonly currency: 'USD' | 'EUR' | 'GBP';

  constructor(amount: number, currency: 'USD' | 'EUR' | 'GBP') {
    if (amount < 0) {
      throw new Error('Money amount cannot be negative');
    }
    this.amount = amount;
    this.currency = currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch');
    }
    return new Money(this.amount + other.amount, this.currency);
  }
}


// Aggregate root: enforces all invariants for its cluster of entities.
// A plain union + `as const` map stands in for an enum (no runtime `enum` here).
const OrderStatus = {
  Pending: 'pending',
  Submitted: 'submitted',
} as const;
type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export class Order {
  readonly id: string;
  readonly customerId: string;
  private items: OrderItem[] = [];
  private status: OrderStatus = OrderStatus.Pending;
  private events: DomainEvent[] = [];

  constructor(id: string, customerId: string) {
    this.id = id;
    this.customerId = customerId;
  }

  addItem(product: Product, quantity: number): void {
    if (this.status !== OrderStatus.Pending) {
      throw new Error('Cannot modify a submitted order');
    }
    const item = new OrderItem(product, quantity);
    this.items.push(item);
    this.events.push(new ItemAddedEvent(this.id, item));
  }

  get total(): Money {
    return this.items.reduce((sum, item) => sum.add(item.subtotal()), new Money(0, 'USD'));
  }

  submit(): void {
    if (this.items.length === 0) {
      throw new Error('Cannot submit an empty order');
    }
    if (this.status !== OrderStatus.Pending) {
      throw new Error('Order already submitted');
    }
    this.status = OrderStatus.Submitted;
    this.events.push(new OrderSubmittedEvent(this.id));
  }

  popEvents(): DomainEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}


// Repository: persist and reconstitute aggregates
export interface OrderRepository {
  findById(orderId: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  // Implementations persist events via popEvents() after writing state
}
```
