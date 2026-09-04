import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/supabase/supabase_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';
import '../../work/models/work_record_model.dart';
import '../providers/dashboard_provider.dart';

// Material You tonal container tones (from the same #6750A4 seed as
// AppTheme.primary) used for the tonal cards on this screen.
class _Tone {
  static const Color kpiWrap = Color(0xFFE8DEF8);
  static const Color kpiWrapBorder = Color(0xFFD0BCFF);
  static const Color tileBg = Color(0xFFF3EDF7);
  static const Color tileBorder = Color(0xFFD0BCFF);
  static const Color iconBg = Color(0xFFEADDFF);
  static const Color iconFg = Color(0xFF21005D);
  static const Color sessionsWrap = Color(0xFFF3EDF7);
  static const Color sessionsWrapBorder = Color(0xFFE6E0E9);
  static const Color sessionCardBg = Color(0xFFFEF7FF);
  static const Color sessionCardBorder = Color(0xFFE8DEF8);
  static const Color chipBg = Color(0xFFF3EDF7);
  static const Color chipBorder = Color(0xFFCAC4D0);
}

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffAsync = ref.watch(currentStaffProvider);
    final statsAsync = ref.watch(dashboardStatsProvider);
    final now = DateTime.now();

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Greeting row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: staffAsync.when(
                          data: (staff) => Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Good ${_greeting()}, ${staff?.name.split(' ').first ?? ''}',
                                style: const TextStyle(
                                  color: AppTheme.textPrimary,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.3,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                DateFormat('EEEE, MMMM d').format(now),
                                style: const TextStyle(
                                  color: AppTheme.textSecondary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                          loading: () => const SizedBox(),
                          error: (_, __) => const SizedBox(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                            decoration: BoxDecoration(
                              color: _Tone.chipBg,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: _Tone.chipBorder),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  decoration: const BoxDecoration(
                                    color: AppTheme.primary,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  DateFormat('HH:mm').format(now),
                                  style: const TextStyle(
                                    color: AppTheme.textSecondary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 8),
                          GestureDetector(
                            onTap: () => context.go('/add-work'),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppTheme.primary,
                                borderRadius: BorderRadius.circular(999),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppTheme.primary.withOpacity(0.25),
                                    blurRadius: 10,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.add, size: 15, color: Colors.white),
                                  SizedBox(width: 4),
                                  Text(
                                    'New Session',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Overview Metrics — tonal KPI grid
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _Tone.kpiWrap,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: _Tone.kpiWrapBorder.withOpacity(0.5)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: _Tone.tileBg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'OVERVIEW METRICS',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        statsAsync.when(
                          data: (stats) => Column(
                            children: [
                              Row(
                                children: [
                                  _KpiTile(
                                    label: "Today's Revenue",
                                    value: '\$${stats.todayRevenue.toStringAsFixed(2)}',
                                    icon: Icons.attach_money,
                                    badge: 'Today',
                                    badgeBg: const Color(0xFFC4EED0),
                                    badgeFg: const Color(0xFF146C2E),
                                  ),
                                  const SizedBox(width: 10),
                                  _KpiTile(
                                    label: 'Customers Today',
                                    value: '${stats.todayCustomers}',
                                    icon: Icons.people_outline,
                                    badge: 'Active',
                                    badgeBg: const Color(0xFFC2E7FF),
                                    badgeFg: const Color(0xFF001D35),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  _KpiTile(
                                    label: 'Monthly Revenue',
                                    value: '\$${stats.monthlyRevenue.toStringAsFixed(2)}',
                                    icon: Icons.trending_up,
                                    badge: DateFormat('MMM yyyy').format(now),
                                    badgeBg: const Color(0xFFC4EED0),
                                    badgeFg: const Color(0xFF146C2E),
                                  ),
                                  const SizedBox(width: 10),
                                  _KpiTile(
                                    label: 'Month Visits',
                                    value: '${stats.monthlyCustomers}',
                                    icon: Icons.calendar_month_outlined,
                                    badge: 'Total',
                                    badgeBg: const Color(0xFFFFD8E4),
                                    badgeFg: const Color(0xFF31111D),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                          error: (e, _) => Text('Error: $e'),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Today's Sessions
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _Tone.sessionsWrap,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: _Tone.sessionsWrapBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "TODAY'S SESSIONS",
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.6,
                            color: AppTheme.primary,
                          ),
                        ),
                        const SizedBox(height: 12),
                        ref.watch(todayRecordsProvider).when(
                              data: (records) => records.isEmpty
                                  ? const _EmptyState(
                                      icon: Icons.assignment_outlined,
                                      message: 'No sessions today yet',
                                      subtitle: 'Tap New Session to start tracking',
                                    )
                                  : Column(
                                      children: records
                                          .map((r) => _WorkRecordCard(record: r))
                                          .toList(),
                                    ),
                              loading: () => const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(24),
                                  child: CircularProgressIndicator(),
                                ),
                              ),
                              error: (e, _) => Text('Error: $e'),
                            ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }
}

class _KpiTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final String badge;
  final Color badgeBg;
  final Color badgeFg;

  const _KpiTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.badge,
    required this.badgeBg,
    required this.badgeFg,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _Tone.tileBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _Tone.tileBorder.withOpacity(0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(
                    color: _Tone.iconBg,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: _Tone.iconFg, size: 16),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: badgeBg,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    badge,
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: badgeFg,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkRecordCard extends StatelessWidget {
  final WorkRecordModel record;
  const _WorkRecordCard({required this.record});

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('HH:mm');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _Tone.sessionCardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _Tone.sessionCardBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: const BoxDecoration(
              color: AppTheme.primary,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                record.customerName.isNotEmpty ? record.customerName[0].toUpperCase() : '?',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.customerName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: AppTheme.textPrimary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '${record.serviceName} · ${fmt.format(record.startTime.toLocal())}',
                  style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '\$${record.amount.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primary,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: record.endTime != null
                      ? const Color(0xFFC4EED0)
                      : const Color(0xFFFFF2C6),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  record.endTime != null ? 'Done' : 'Active',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: record.endTime != null
                        ? const Color(0xFF146C2E)
                        : const Color(0xFF7A5B00),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  final String subtitle;

  const _EmptyState({
    required this.icon,
    required this.message,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28),
      decoration: BoxDecoration(
        color: _Tone.sessionCardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _Tone.sessionCardBorder),
      ),
      child: Column(
        children: [
          Icon(icon, size: 28, color: AppTheme.primary),
          const SizedBox(height: 8),
          Text(
            message,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}
