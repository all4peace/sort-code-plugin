// Test Case 2: Class with mixed public/private methods
// Methods are out of order and visibility mixed

export class UserService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Creates a new user account
   */
  public createUser(userData: any): string {
    return this.saveUser(userData);
  }

  /**
   * Deletes a user account
   */
  public deleteUser(userId: string): boolean {
    return this.validatePermissions(userId);
  }

  /**
   * Gets user profile information
   */
  public getUserProfile(userId: string): any {
    if (this.validatePermissions(userId)) {
      return { id: userId, name: "User" };
    }
    return null;
  }

  /**
   * Updates user information
   */
  public updateUser(userId: string, data: any): boolean {
    if (this.validatePermissions(userId)) {
      return this.saveUser(data) !== null;
    }
    return false;
  }

  /**
   * Logs user activity
   */
  private logActivity(userId: string, action: string): void {
    console.log(`User ${userId} performed: ${action}`);
  }

  /**
   * Saves user data to database
   */
  private saveUser(userData: any): string {
    console.log("Saving user:", userData);
    return "user-123";
  }

  /**
   * Validates user permissions
   */
  private validatePermissions(userId: string): boolean {
    return userId !== null;
  }
}
