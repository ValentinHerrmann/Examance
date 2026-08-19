import type { Translations } from '../types';

export const errors: Translations['errors'] = {
    unknown: 'Unknown error',
    network: 'Server unreachable',
    unauthorized: 'Unauthorized',
    httpFallback: 'HTTP Error',

    code: {
        ERR_INVALID_TOKEN: 'Invalid or expired password reset link.',
        ERR_PASSWORD_NOT_SET:
            'No password has been set for this account yet. Please use the link sent to your email.',
        ERR_INVALID_CREDENTIALS: 'Invalid credentials.',
        ERR_COMPILE_TIMEOUT: 'Compilation timed out.',
        ERR_PAYLOAD_TOO_LARGE: 'Payload too large.',
        ERR_BAD_REQUEST: 'Bad request.',
        ERR_ORIGIN_REJECTED: 'Origin not allowed.',
        ERR_UNAUTHORIZED: 'Unauthorized.',
        ERR_NETWORK: 'Server unreachable.',
    },

    http: {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        408: 'Request Timeout',
        409: 'Conflict',
        418: "I'm a teapot",
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout',
    },
};
