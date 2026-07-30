# Advanced Architecture Patterns — Reference

Deep-dive implementation examples for DDD bounded contexts, Onion Architecture, Anti-Corruption Layers, and full project structures. Referenced from SKILL.md.

---

## Full Multi-Service Project Structure

A realistic e-commerce system organised by bounded context, each context is a deployable service:

```
ecommerce/
├── services/
│   ├── identity/                        # Bounded context: users & auth
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   └── user.ts
│   │   │   │   ├── value-objects/
│   │   │   │   │   ├── email.ts
│   │   │   │   │   └── password-hash.ts
│   │   │   │   └── interfaces/
│   │   │   │       └── user-repository.ts
│   │   │   ├── use-cases/
│   │   │   │   ├── register-user.ts
│   │   │   │   └── authenticate-user.ts
│   │   │   ├── adapters/
│   │   │   │   ├── repositories/
│   │   │   │   │   └── postgres-user.repository.ts
│   │   │   │   └── controllers/
│   │   │   │       └── auth.controller.ts
│   │   │   └── infrastructure/
│   │   │       └── jwt.service.ts
│   │   └── tests/
│   │       ├── unit/
│   │       └── integration/
│   │
│   ├── catalog/                         # Bounded context: products
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   └── product.ts
│   │   │   │   └── value-objects/
│   │   │   │       ├── sku.ts
│   │   │   │       └── price.ts
│   │   │   └── use-cases/
│   │   │       ├── create-product.ts
│   │   │       └── update-inventory.ts
│   │   └── tests/
│   │
│   └── ordering/                        # Bounded context: orders
│       ├── src/
│       │   ├── domain/
│       │   │   ├── entities/
│       │   │   │   └── order.ts
│       │   │   ├── value-objects/
│       │   │   │   ├── customer-id.ts       # NOT imported from identity!
│       │   │   │   └── money.ts
│       │   │   └── interfaces/
│       │   │       ├── order-repository.ts
│       │   │       └── catalog-client.ts    # ACL port to catalog context
│       │   ├── use-cases/
│       │   │   ├── place-order.ts
│       │   │   └── cancel-order.ts
│       │   └── adapters/
│       │       ├── acl/
│       │       │   └── catalog-http.client.ts   # ACL adapter
│       │       └── repositories/
│       │           └── postgres-order.repository.ts
│       └── tests/
│
├── shared/                              # Shared kernel (use sparingly)
│   └── domain-events/
│       └── base-event.ts
└── docker-compose.yml
```

---

## Onion Architecture vs. Clean Architecture

Both enforce inward-pointing dependencies. The difference is terminology and layering granularity:

| Concern | Clean Architecture | Onion Architecture |
|---|---|---|
| Innermost ring | Entities | Domain Model |
| Second ring | Use Cases | Domain Services |
| Third ring | Interface Adapters | Application Services |
| Outermost ring | Frameworks & Drivers | Infrastructure / UI / Tests |
| Key insight | Controller is an adapter | Application Services = Use Cases |

Onion Architecture makes the Domain Services layer explicit — it hosts pure domain logic that spans multiple entities but has no I/O:

```ts
// onion/domain/services/pricing.service.ts
import type { Product } from '../entities/product.ts';
import { Money } from '../value-objects/money.ts';
import { Discount } from '../value-objects/discount.ts';

export class PricingService {
  // Domain service: logic that doesn't belong to a single entity.
  // No ports or adapters here — purely domain computation.

  applyBulkDiscount(product: Product, quantity: number): Money {
    let discount: Discount;
    if (quantity >= 100) {
      discount = new Discount(20);
    } else if (quantity >= 50) {
      discount = new Discount(10);
    } else {
      discount = new Discount(0);
    }
    return product.price.applyDiscount(discount);
  }

  calculateOrderTotal(items: Array<[Product, number]>): Money {
    const subtotals = items.map(([product, quantity]) => this.applyBulkDiscount(product, quantity));
    return subtotals.reduce((sum, subtotal) => sum.add(subtotal), new Money(0, 'USD'));
  }
}
```

---

## Anti-Corruption Layer (ACL)

When the `Ordering` context must fetch product data from the `Catalog` context, it should never use `Catalog`'s domain model directly. An ACL translates between the two models:

```ts
// ordering/domain/interfaces/catalog-client.ts
// Ordering's view of product data. Uses Ordering's own value object,
// not Catalog's Product entity.
import type { ProductSnapshot } from '../value-objects/product-snapshot.ts';

export interface CatalogClientPort {
  getProductSnapshot(sku: string): Promise<ProductSnapshot>;
}


// ordering/domain/value-objects/product-snapshot.ts
// Ordering's local representation of a product at order time.
import type { Money } from './money.ts';

export interface ProductSnapshot {
  readonly sku: string;
  readonly name: string;
  readonly unitPrice: Money;
  readonly available: boolean;
}


// ordering/adapters/acl/catalog-http.client.ts
// ACL adapter: calls Catalog's HTTP API and translates
// Catalog's response schema into Ordering's ProductSnapshot.
import type { CatalogClientPort } from '../../domain/interfaces/catalog-client.ts';
import type { ProductSnapshot } from '../../domain/value-objects/product-snapshot.ts';
import { Money } from '../../domain/value-objects/money.ts';

export class CatalogHttpClient implements CatalogClientPort {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getProductSnapshot(sku: string): Promise<ProductSnapshot> {
    const response = await fetch(`${this.baseUrl}/products/${sku}`);
    if (!response.ok) {
      throw new Error(`Catalog request failed: ${response.status}`);
    }
    const data = await response.json();

    // Translation: Catalog speaks "price_cents" + "currency_code";
    // Ordering speaks Money(amount, currency).
    return {
      sku: data.sku,
      name: data.title, // field name differs between contexts
      unitPrice: new Money(data.price_cents, data.currency_code),
      available: data.stock_count > 0,
    };
  }
}


// Test ACL with a stub — no HTTP required
export class StubCatalogClient implements CatalogClientPort {
  private products: Map<string, ProductSnapshot>;

  constructor(products: Map<string, ProductSnapshot>) {
    this.products = products;
  }

  async getProductSnapshot(sku: string): Promise<ProductSnapshot> {
    const snapshot = this.products.get(sku);
    if (!snapshot) {
      throw new Error(`Unknown SKU: ${sku}`);
    }
    return snapshot;
  }
}
```

---

## Context Map — Relationships Between Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────┐
│                        E-Commerce System                         │
│                                                                  │
│   ┌─────────────┐   Open Host   ┌─────────────────────────┐    │
│   │  Identity   │──────────────▶│        Ordering          │    │
│   │  Context    │               │  (uses CustomerId VO,    │    │
│   │             │               │   not User entity)       │    │
│   └─────────────┘               └─────────────────────────┘    │
│                                          │ ACL                   │
│                                          ▼                       │
│                                 ┌─────────────────┐             │
│   ┌─────────────┐  Shared       │    Catalog      │             │
│   │  Payments   │  Kernel       │    Context      │             │
│   │  Context    │◀─────────────▶│                 │             │
│   │             │  (Money VO)   └─────────────────┘             │
│   └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘

Relationship types:
  Open Host Service  — upstream provides a stable API for many downstream contexts
  ACL (Anti-Corruption Layer) — downstream translates upstream model to its own
  Shared Kernel     — two contexts share a small, explicitly governed sub-model
  Conformist        — downstream adopts upstream model as-is (last resort)
```

---

## Dependency Injection Wiring — Infrastructure Layer

All the abstract interfaces are wired to concrete implementations in the infrastructure layer (or a DI container). Nothing else in the codebase knows which concrete class is used:

```ts
// infrastructure/container.ts
import { Pool } from 'pg';
import { PostgresUserRepository } from '../adapters/repositories/postgres-user.repository.ts';
import { CreateUserUseCase } from '../use-cases/create-user.ts';
import { getSettings } from './config.ts';

let pool: Pool | undefined;

const getDbPool = (): Pool => {
  pool ??= new Pool({ connectionString: getSettings().databaseUrl });
  return pool;
};

export const getCreateUserUseCase = (): CreateUserUseCase => {
  const repo = new PostgresUserRepository(getDbPool());
  return new CreateUserUseCase(repo);
};

// In tests, construct CreateUserUseCase directly with an InMemoryUserRepository —
// no container or other code changes needed.
```

---

## Aggregate Design Heuristics

Use these rules when deciding aggregate boundaries:

| Question | Guidance |
|---|---|
| Should these two objects always be consistent together? | Put them in the same aggregate. |
| Can they be eventually consistent? | Put them in separate aggregates; use domain events to sync. |
| Is one object the "owner" that controls access? | That object is the aggregate root. |
| Does removing the root make the child meaningless? | Child belongs inside the aggregate. |
| Are you loading thousands of objects to change one? | Aggregate is too large — split it. |

**Practical example — Order vs. Customer:**

```ts
// Bad: Customer aggregate holds full Order objects
class Customer {
  private orders: Order[] = []; // loads all orders every time
}

// Good: Customer holds Order IDs only; Order is its own aggregate
class Customer {
  private orderIds: string[] = []; // lightweight reference
}

class Order {
  readonly id: string;
  readonly customerId: string; // reference back, not the full object

  constructor(id: string, customerId: string) {
    this.id = id;
    this.customerId = customerId;
  }
}
```

---

## Domain Events — Publishing and Handling

Domain events decouple aggregates that need to react to each other's state changes:

```ts
// domain/events/order-events.ts
export abstract class DomainEvent {
  readonly occurredAt: Date = new Date();
}

export class OrderSubmittedEvent extends DomainEvent {
  readonly orderId: string;
  readonly customerId: string;
  readonly totalCents: number;
  readonly currency: string;

  constructor(orderId: string, customerId: string, totalCents: number, currency = 'USD') {
    super();
    this.orderId = orderId;
    this.customerId = customerId;
    this.totalCents = totalCents;
    this.currency = currency;
  }
}


// adapters/event-publisher/postgres-outbox.publisher.ts
// Transactional outbox pattern: write events to the same DB transaction as state.
import type { PoolClient } from 'pg';
import type { DomainEvent } from '../../domain/events/order-events.ts';

export class PostgresOutboxPublisher {
  // Writes domain events to an outbox table in the same transaction
  // as the aggregate state. A separate relay process reads and publishes
  // to the message broker. Guarantees at-least-once delivery.

  async publish(conn: PoolClient, events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await conn.query(
        `INSERT INTO outbox (event_type, payload, published_at)
         VALUES ($1, $2, NULL)`,
        [event.constructor.name, JSON.stringify(event)],
      );
    }
  }
}


// use-cases/place-order.ts — aggregate saves, events are extracted and stored
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { Order } from '../domain/entities/order.ts';
import type { OrderRepository } from '../domain/interfaces/order-repository.ts';
import type { PostgresOutboxPublisher } from '../adapters/event-publisher/postgres-outbox.publisher.ts';

export class PlaceOrderUseCase {
  private orders: OrderRepository;
  private publisher: PostgresOutboxPublisher;
  private db: Pool;

  constructor(orderRepo: OrderRepository, eventPublisher: PostgresOutboxPublisher, db: Pool) {
    this.orders = orderRepo;
    this.publisher = eventPublisher;
    this.db = db;
  }

  async execute(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const order = new Order(randomUUID(), request.customerId);
    for (const item of request.items) {
      order.addItem(item.product, item.quantity);
    }
    order.submit();

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.orders.save(order, client);
      await this.publisher.publish(client, order.popEvents());
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { orderId: order.id, success: true };
  }
}
```

---

## Detecting and Breaking Dependency Cycles

Common symptoms and their structural fixes:

```
Symptom: use-cases/create-order.ts imports from adapters/email-sender.ts
Fix:     Create domain/interfaces/notification-service.ts (abstract port).
         use-cases imports the port. adapters implements it.
         DI container wires them together.

Symptom: domain/entities/user.ts imports from infrastructure/config.ts
Fix:     Pass config values as constructor arguments or environment at
         the infrastructure boundary. Domain entities must not read config.

Symptom: Two aggregates import each other
Fix:     Introduce a domain event. Aggregate A emits OrderPlaced.
         Aggregate B's use case subscribes and reacts. They never import
         each other.

Symptom: Repository imports a use case to "do extra work" after saving
Fix:     Extract the extra work into a separate domain service or use case.
         Repositories persist state only; they do not orchestrate behaviour.
```

Visual dependency check — run this and look for any arrow pointing outward:

```bash
# Install: pnpm add -D madge
npx madge --circular --extensions ts src
# Expected: no circular-dependency output, and domain/ has no outgoing edges
# to adapters/ or infrastructure/
```
