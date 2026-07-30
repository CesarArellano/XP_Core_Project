import request from 'supertest';

import { createApp } from '../app.ts';

describe('GET /health', () => {
  it('returns a 200 with status ok when the service is running', async () => {
    // Arrange
    const app = createApp();

    // Act
    const response = await request(app).get('/health');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /unknown-route', () => {
  it('returns a 404 with an error message when the route does not exist', async () => {
    // Arrange
    const app = createApp();

    // Act
    const response = await request(app).get('/unknown-route');

    // Assert
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});
