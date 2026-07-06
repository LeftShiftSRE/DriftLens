export interface User {
  id: string;
  email: string;
}

export class UserService {
  private readonly users = new Map<string, User>();

  getById(id: string): User | undefined {
    return this.users.get(id);
  }

  create(user: User): void {
    this.users.set(user.id, user);
  }
}
