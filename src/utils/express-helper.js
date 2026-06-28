import { sentry } from "../config/sentry";

// send 201 response with the message
export const created = function(req, res, next) {
  res.created = function(message) {
    let data =
      typeof message === "object"
        ? message
        : {
            message,
          };
    return res.status(201).json({ success: true, data });
  };
  next();
};

// send 200 response
export const ok = function(req, res, next) {
  res.ok = function(message) {
    let data =
      typeof message === "object"
        ? message
        : {
            message,
          };

    return res.status(200).json({ success: true, data });
  };
  next();
};

// send 400 error -  either db created or validator error
export const error = function(req, res, next) {
  res.error = function(message) {
    let data =
      typeof message === "object"
        ? message
        : {
            message,
          };
    // TODO: SET USER CONTEXT
    sentry(data, req);
    return res.status(400).json({ success: false, data });
  };
  next();
};

// send 401 error -  unauthorized access
export const unauthorized = function(req, res, next) {
  res.unauthorized = function(message) {
    // TODO: SET USER CONTEXT
    const data = { error: message || "Unauthorized access" };
    sentry(data, req);
    return res.status(401).json({
      success: false,
      data,
    });
  };
  next();
};

// send 409 error -  conflict
export const conflict = function(req, res, next) {
  res.conflict = function(message) {
    const data = { error: message };
    sentry(data, req);
    return res.status(409).json({ success: false, data });
  };
  next();
};

// send 403 error -  forbidden
export const forbidden = function(req, res, next) {
  res.forbidden = function(message) {
    let data =
      typeof message === "object"
        ? message
        : {
            message: message || "forbidden",
          };
    sentry(data, req);
    return res.status(403).json({ success: false, data });
  };
  next();
};
