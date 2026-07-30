import { getHealthStatus } from './health.service.ts';

describe('getHealthStatus', () => {
  it('returns an object with status "ok" when called', () => {
    // Arrange
    // (no setup needed — getHealthStatus takes no input)

    // Act
    const result = getHealthStatus();

    // Assert
    expect(result).toEqual({ status: 'ok' });
  });
});
