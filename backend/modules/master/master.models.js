const { DataTypes } = require('sequelize');

// The three master tables (sql/create_assy_core.sql) and their associations.
// The schema lives in the .sql files: these models never sync().
// allowNull: false only where the column is NOT NULL and has no DB default, so a
// row without a DB-defaulted column (created_at) passes validation and the DB fills it.
const defineMasterModels = (sequelize) => {
    // Defined once per Sequelize instance: index.js and the integration tests both call this.
    if (sequelize.models.MasterProcess) return sequelize.models;

    const MasterProcess = sequelize.define('MasterProcess', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        process_code: { type: DataTypes.STRING(10), allowNull: false },
        process_name: { type: DataTypes.STRING(50), allowNull: false },
        can_clear_tag: { type: DataTypes.BOOLEAN },
    }, { tableName: 'tb_master_process' });

    const MasterLocation = sequelize.define('MasterLocation', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        location_code: { type: DataTypes.STRING(20), allowNull: false },
        location_name: { type: DataTypes.STRING(100), allowNull: false },
        process_id: { type: DataTypes.INTEGER, allowNull: false },
        is_active: { type: DataTypes.BOOLEAN },
        created_at: { type: DataTypes.DATE },
    }, { tableName: 'tb_master_location' });

    const MasterStatus = sequelize.define('MasterStatus', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        status_code: { type: DataTypes.STRING(30), allowNull: false },
        status_label: { type: DataTypes.STRING(50), allowNull: false },
        seq: { type: DataTypes.INTEGER, allowNull: false },
        // NULL only for CLEARED (CK_master_assy_status_location_rule).
        location_id: { type: DataTypes.INTEGER },
    }, { tableName: 'tb_master_assy_status' });

    MasterProcess.hasMany(MasterLocation, { foreignKey: 'process_id', as: 'locations' });
    MasterLocation.belongsTo(MasterProcess, { foreignKey: 'process_id', as: 'process' });
    MasterLocation.hasOne(MasterStatus, { foreignKey: 'location_id', as: 'status' });
    MasterStatus.belongsTo(MasterLocation, { foreignKey: 'location_id', as: 'location' });

    return sequelize.models;
};

module.exports = { defineMasterModels };
