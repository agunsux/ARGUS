/**
 * TIKUM / ARGUS — User & Authentication Repository Interface
 *
 * Abstract contract for user identity, sessions, roles, and security audit logs.
 */

class UserRepository {
  async ensureInitialized() {
    throw new Error('UserRepository.ensureInitialized() not implemented');
  }

  // Users
  async createUser(userData) {
    throw new Error('UserRepository.createUser() not implemented');
  }

  async getUserById(id) {
    throw new Error('UserRepository.getUserById() not implemented');
  }

  async getUserByEmail(email) {
    throw new Error('UserRepository.getUserByEmail() not implemented');
  }

  async getUserByUsername(username) {
    throw new Error('UserRepository.getUserByUsername() not implemented');
  }

  async updateUser(id, updates) {
    throw new Error('UserRepository.updateUser() not implemented');
  }

  async updateUserPassword(id, passwordHash) {
    throw new Error('UserRepository.updateUserPassword() not implemented');
  }

  async updateUserStatus(id, status) {
    throw new Error('UserRepository.updateUserStatus() not implemented');
  }

  async listUsers(filter = {}) {
    throw new Error('UserRepository.listUsers() not implemented');
  }

  // Sessions
  async createSession(sessionData) {
    throw new Error('UserRepository.createSession() not implemented');
  }

  async getSessionByTokenHash(tokenHash) {
    throw new Error('UserRepository.getSessionByTokenHash() not implemented');
  }

  async revokeSession(tokenHash, reason) {
    throw new Error('UserRepository.revokeSession() not implemented');
  }

  async revokeAllUserSessions(userId, exceptTokenHash, reason) {
    throw new Error('UserRepository.revokeAllUserSessions() not implemented');
  }

  // Roles
  async getUserRoles(userId) {
    throw new Error('UserRepository.getUserRoles() not implemented');
  }

  async assignUserRole(userId, role, assignedBy) {
    throw new Error('UserRepository.assignUserRole() not implemented');
  }

  async revokeUserRole(userId, role) {
    throw new Error('UserRepository.revokeUserRole() not implemented');
  }

  // Audit Events
  async recordAuthAudit(auditData) {
    throw new Error('UserRepository.recordAuthAudit() not implemented');
  }
}

module.exports = { UserRepository };
