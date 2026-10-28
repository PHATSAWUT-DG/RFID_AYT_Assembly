const { withMasterErrors, orNotFound } = require('../master.errors');

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

    const createLocation = (input) => withMasterErrors(LOCATION_RULES, () => repo.insertLocation(db, input));

    const updateLocation = async (id, input) =>
        orNotFound(await withMasterErrors(LOCATION_RULES, () => repo.updateLocation(db, id, input)), 'Location', id);

    return { listLocations, createLocation, updateLocation };
};

module.exports = { createLocationsService };
