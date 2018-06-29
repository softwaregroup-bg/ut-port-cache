module.exports = ({defineError, getError, fetchErrors}) => {
    if (!getError('cache')) {
        defineError('cache', null, 'cache error', 'error');
    }
    return fetchErrors('cache');
};
