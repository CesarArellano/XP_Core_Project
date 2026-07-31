import { hashPassword, verifyPassword } from './password.ts';

describe('hashPassword', () => {
  it('returns a bcrypt hash distinct from the plaintext input when called', async () => {
    // Arrange
    const plainTextPassword = 'correct-horse-battery-staple';

    // Act
    const hash = await hashPassword(plainTextPassword);

    // Assert
    expect(hash).not.toEqual(plainTextPassword);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('returns a different hash for the same password when called twice', async () => {
    // Arrange
    const plainTextPassword = 'correct-horse-battery-staple';

    // Act
    const firstHash = await hashPassword(plainTextPassword);
    const secondHash = await hashPassword(plainTextPassword);

    // Assert
    expect(firstHash).not.toEqual(secondHash);
  });
});

describe('verifyPassword', () => {
  it('returns true when given the password that produced the hash', async () => {
    // Arrange
    const plainTextPassword = 'correct-horse-battery-staple';
    const hash = await hashPassword(plainTextPassword);

    // Act
    const result = await verifyPassword(plainTextPassword, hash);

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when given a password that does not match the hash', async () => {
    // Arrange
    const hash = await hashPassword('correct-horse-battery-staple');

    // Act
    const result = await verifyPassword('wrong-password', hash);

    // Assert
    expect(result).toBe(false);
  });
});
