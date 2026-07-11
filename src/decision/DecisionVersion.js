/**
 * DecisionVersion — Phase 5 Decision Domain
 * 
 * Enforces schema compatibility and guides transformation paths for Decision 
 * models as they evolve across versions.
 */
class DecisionVersion {
  constructor() {
    this.migrations = new Map();
  }

  /**
   * Registers a migration function to transform a Decision payload from one version to another.
   */
  registerMigration(fromVersion, toVersion, migrateFn) {
    this.migrations.set(`${fromVersion}->${toVersion}`, migrateFn);
  }

  /**
   * Migrates a raw Decision payload step-by-step to a target version.
   */
  migrate(payload, targetVersion) {
    let currentVersion = payload.version || 1;
    let data = { ...payload };

    while (currentVersion < targetVersion) {
      const nextVersion = currentVersion + 1;
      const key = `${currentVersion}->${nextVersion}`;
      const migrate = this.migrations.get(key);

      if (!migrate) {
        throw new Error(`Data migration path from v${currentVersion} to v${nextVersion} is missing`);
      }

      data = migrate(data);
      currentVersion = nextVersion;
      data.version = currentVersion;
    }

    return data;
  }
}

module.exports = DecisionVersion;
