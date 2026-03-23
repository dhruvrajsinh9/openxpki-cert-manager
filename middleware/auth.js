// Checks if a user is logged in before allowing access to protected routes

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/');
}

module.exports = { isAuthenticated };
