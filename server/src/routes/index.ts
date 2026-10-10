import express, { Router } from 'express';
import { healthController } from '../controllers/healthController.js';
import { authController } from '../controllers/authController.js';
import { userController } from '../controllers/userController.js';
import { adminController } from '../controllers/adminController.js';
import { tripController } from '../controllers/tripController.js';
import { itineraryController } from '../controllers/itineraryController.js';
import { reservationController } from '../controllers/reservationController.js';
import { documentController } from '../controllers/documentController.js';
import { aiController } from '../controllers/aiController.js';
import { pexelsController } from '../controllers/pexelsController.js';
import { reportController } from '../controllers/reportController.js';
import { expenseController } from '../controllers/expenseController.js';
import { inviteController } from '../controllers/inviteController.js';
import { inboundEmailController } from '../controllers/inboundEmailController.js';

import { requireAuth, requireAdmin, requireTripRole } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { uploadMiddleware } from '../middleware/upload.js';

const router = Router();

// 1. Healthcheck
router.get('/health', healthController.check);

// 2. Authentication
router.post('/auth/login', authLimiter, verifyTurnstile, authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', requireAuth, authController.me);
router.post('/auth/password', requireAuth, authController.updatePassword);
router.post('/auth/forgot-password', authLimiter, authController.forgotPassword);
router.post('/auth/reset-password', authLimiter, authController.resetPasswordWithToken);

// 3. User Management (Admin only)
router.get('/users', requireAuth, requireAdmin, userController.listUsers);
router.post('/users', requireAuth, requireAdmin, userController.createUser);
router.put('/users/:id', requireAuth, requireAdmin, userController.updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, userController.deleteUser);

// 3.0 Admin Dashboard & Audits (Admin only)
router.get('/admin/overview', requireAuth, requireAdmin, adminController.getOverview);
router.get('/admin/ai-audits', requireAuth, requireAdmin, adminController.getAiAudits);
router.get('/admin/users', requireAuth, requireAdmin, adminController.getUsersStats);
router.get('/admin/group-trips', requireAuth, requireAdmin, adminController.getGroupTrips);
router.get('/admin/destinations', requireAuth, requireAdmin, adminController.getDestinationsStats);

// 3.1 User Invitations (Any authenticated user can invite; public token endpoints to accept)
router.post('/invites', requireAuth, inviteController.createInvite);
router.get('/invites/:token', authLimiter, inviteController.getInviteByToken);
router.post('/invites/:token/accept', authLimiter, inviteController.acceptInvite);
router.delete('/invites/:id', requireAuth, inviteController.revokeInvite);
router.get('/trips/:tripId/invitations', requireAuth, requireTripRole('VIEWER'), inviteController.listTripInvitations);

// 4. Trips
router.get('/trips', requireAuth, tripController.listTrips);
router.post('/trips', requireAuth, tripController.createTrip);
router.get('/trips/:id', requireAuth, requireTripRole('VIEWER'), tripController.getTrip);
router.put('/trips/:id', requireAuth, requireTripRole('EDITOR'), tripController.updateTrip);
router.delete('/trips/:id', requireAuth, requireTripRole('OWNER'), tripController.deleteTrip);

// Trip Members
router.post('/trips/:id/members', requireAuth, requireTripRole('OWNER'), tripController.addMember);
router.put('/trips/:id/members/:memberId', requireAuth, requireTripRole('OWNER'), tripController.updateMemberRole);
router.delete('/trips/:id/members/:memberId', requireAuth, requireTripRole('OWNER'), tripController.removeMember);

// Trip Travelers & Companions
router.get('/trips/:tripId/travelers', requireAuth, requireTripRole('VIEWER'), tripController.listTravelers);
router.post('/trips/:tripId/travelers', requireAuth, requireTripRole('EDITOR'), tripController.createCompanion);
router.put('/trips/:tripId/travelers/:travelerId', requireAuth, requireTripRole('EDITOR'), tripController.updateTraveler);
router.delete('/trips/:tripId/travelers/:travelerId', requireAuth, requireTripRole('EDITOR'), tripController.deleteTraveler);

// 5. Itinerary & Days
router.get('/trips/:tripId/days', requireAuth, requireTripRole('VIEWER'), itineraryController.listDays);
router.post('/trips/:tripId/days', requireAuth, requireTripRole('EDITOR'), itineraryController.createDay);
router.put('/trips/:tripId/days/reorder', requireAuth, requireTripRole('EDITOR'), itineraryController.reorderDays);
router.put('/trips/:tripId/days/:dayId', requireAuth, requireTripRole('EDITOR'), itineraryController.updateDay);
router.delete('/trips/:tripId/days/:dayId', requireAuth, requireTripRole('EDITOR'), itineraryController.deleteDay);

router.post('/trips/:tripId/days/:dayId/items', requireAuth, requireTripRole('EDITOR'), itineraryController.createItineraryItem);
router.put('/trips/:tripId/days/items/:itemId/move', requireAuth, requireTripRole('EDITOR'), itineraryController.moveItem);
router.put('/trips/:tripId/days/:dayId/items/reorder', requireAuth, requireTripRole('EDITOR'), itineraryController.reorderItems);
router.put('/trips/:tripId/days/:dayId/items/:itemId', requireAuth, requireTripRole('EDITOR'), itineraryController.updateItineraryItem);
router.delete('/trips/:tripId/days/:dayId/items/:itemId', requireAuth, requireTripRole('EDITOR'), itineraryController.deleteItineraryItem);
router.post('/trips/:tripId/itinerary/locations/refresh', requireAuth, requireTripRole('EDITOR'), itineraryController.refreshLocations);
router.post('/trips/:tripId/itinerary/sync-flights', requireAuth, requireTripRole('EDITOR'), itineraryController.syncFlights);
router.put('/trips/:tripId/itinerary/items/:itemId/location-confirmation', requireAuth, requireTripRole('EDITOR'), itineraryController.setLocationConfirmation);
router.put('/trips/:tripId/itinerary/items/:itemId/map-mode', requireAuth, requireTripRole('EDITOR'), itineraryController.setMapMode);

// 6. Reservations (Flights, Trains, Hotels)
router.get('/trips/:tripId/transports', requireAuth, requireTripRole('VIEWER'), reservationController.listTransports);
router.post('/trips/:tripId/transports', requireAuth, requireTripRole('EDITOR'), reservationController.createTransport);
router.delete('/trips/:tripId/transports/:transportId', requireAuth, requireTripRole('EDITOR'), reservationController.deleteTransport);

router.get('/trips/:tripId/hotels', requireAuth, requireTripRole('VIEWER'), reservationController.listHotels);
router.get('/trips/:tripId/hotels/suggestions', requireAuth, requireTripRole('VIEWER'), reservationController.suggestHotels);
router.post('/trips/:tripId/hotels', requireAuth, requireTripRole('EDITOR'), reservationController.createHotel);
router.put('/trips/:tripId/hotels/:hotelId', requireAuth, requireTripRole('EDITOR'), reservationController.updateHotel);
router.delete('/trips/:tripId/hotels/:hotelId', requireAuth, requireTripRole('EDITOR'), reservationController.deleteHotel);

// 7. Documents & AI Extraction
router.get('/trips/:tripId/documents', requireAuth, requireTripRole('VIEWER'), documentController.listDocuments);
router.post(
  '/trips/:tripId/documents/upload',
  requireAuth,
  requireTripRole('EDITOR'),
  uploadMiddleware.single('file'),
  documentController.uploadDocument
);
router.post('/trips/:tripId/documents/:documentId/confirm', requireAuth, requireTripRole('EDITOR'), documentController.confirmExtraction);
router.post('/trips/:tripId/documents/:documentId/reprocess', requireAuth, requireTripRole('EDITOR'), documentController.reprocessDocument);
router.delete('/trips/:tripId/documents/:documentId', requireAuth, requireTripRole('EDITOR'), documentController.deleteDocument);
router.get('/documents/:documentId/file', requireAuth, documentController.viewDocument);

// 8. AI Travel Assistant
router.post('/trips/:tripId/ai/days/:dayId/narrative', requireAuth, requireTripRole('EDITOR'), aiController.generateDayNarrative);
router.post('/trips/:tripId/ai/itinerary-parse', requireAuth, requireTripRole('EDITOR'), aiController.parseItinerary);
router.get('/trips/:tripId/ai/pexels-suggestions', requireAuth, requireTripRole('VIEWER'), aiController.getPexelsSuggestions);
router.get('/trips/:tripId/ai/logs', requireAuth, requireTripRole('VIEWER'), aiController.listLogs);

// 9. Pexels Integration
router.get('/pexels/search', requireAuth, pexelsController.search);

// 10. Reports & Trip Book
router.get('/trips/:tripId/report/data', requireAuth, requireTripRole('VIEWER'), reportController.getReportData);
router.get('/trips/:tripId/report/html', requireAuth, requireTripRole('VIEWER'), reportController.renderHtml);
router.get('/trips/:tripId/report/pdf', requireAuth, requireTripRole('VIEWER'), reportController.exportPdf);
router.get('/trips/:tripId/report/pdf-status', requireAuth, requireTripRole('VIEWER'), reportController.getPdfStatus);
router.post('/trips/:tripId/report/regenerate-pdf', requireAuth, requireTripRole('EDITOR'), reportController.regeneratePdf);
router.get('/trips/:tripId/share', requireAuth, requireTripRole('VIEWER'), reportController.getShareStatus);
router.post('/trips/:tripId/share', requireAuth, requireTripRole('EDITOR'), reportController.updateShare);
router.get('/public/tripbook/:shareToken/html', reportController.renderPublicSharedHtml);
router.get('/public/tripbook/:shareToken/pdf', reportController.exportPublicSharedPdf);

// 11. Expenses & Transfers
router.get('/trips/:tripId/expenses', requireAuth, requireTripRole('VIEWER'), expenseController.listExpenses);
router.post('/trips/:tripId/expenses', requireAuth, requireTripRole('EDITOR'), expenseController.createExpense);
router.put('/trips/:tripId/expenses/:expenseId', requireAuth, requireTripRole('EDITOR'), expenseController.updateExpense);
router.delete('/trips/:tripId/expenses/:expenseId', requireAuth, requireTripRole('EDITOR'), expenseController.deleteExpense);

// 11.1 Expense Transfers (Direct settlements between travelers)
router.post('/trips/:tripId/expenses/transfers', requireAuth, requireTripRole('EDITOR'), expenseController.createTransfer);
router.put('/trips/:tripId/expenses/transfers/:transferId', requireAuth, requireTripRole('EDITOR'), expenseController.updateTransfer);
router.delete('/trips/:tripId/expenses/transfers/:transferId', requireAuth, requireTripRole('EDITOR'), expenseController.deleteTransfer);

// 12. Inbound Email Ingestion (Protected by X-Inbound-Secret)
router.post(
  '/inbound/email',
  express.raw({ type: () => true, limit: '50mb' }),
  inboundEmailController.handleInboundEmail
);

export default router;
