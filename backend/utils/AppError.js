class AppError extends Error {
    constructor(code, httpStatus, message, details) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
    }
}

module.exports = { AppError };
