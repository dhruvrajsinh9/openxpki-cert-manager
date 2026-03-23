// Restricts access to routes based on user role (requester or approver)

function requireRole(role) {
  return (req, res, next) => {
    if (req.session && req.session.userRole === role) {
      return next();
    }
    res.status(403).send('Access denied: You do not have permission to view this page.');
  };
}

module.exports = { requireRole };
