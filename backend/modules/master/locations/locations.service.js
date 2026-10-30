const { mapMasterErrors, orNotFound } = require('../master.errors');

const LOCATION_RULES = {
    uniques: { UQ_master_location_code: 'location_code' },
    refs: { FK_master_location_process: 'process_id' },
    messages: {
        duplicate: 'Location code already exists',
        invalidRef: 'Process does not exist',
        inUse: 'Location is still in use',
    },
};

const createLocationsService = ({ repo, db }) => {
    const listLocations = () => repo.selectLocations(db);

    const createLocation = (input) => repo.insertLocation(db, input);

    const updateLocation = async (id, input) => {
        const row = await repo.updateLocation(db, id, input);
        return orNotFound(row, 'Location', id);
    };

    // SQL constraint errors from any of these become AppError (LOCATION_RULES).
    return mapMasterErrors(LOCATION_RULES, { listLocations, createLocation, updateLocation });
};

module.exports = { createLocationsService };
