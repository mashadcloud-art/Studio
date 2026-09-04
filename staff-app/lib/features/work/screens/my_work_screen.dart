import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/work_record_model.dart';
import '../providers/work_provider.dart';

class MyWorkScreen extends ConsumerStatefulWidget {
  const MyWorkScreen({super.key});

  @override
  ConsumerState<MyWorkScreen> createState() => _MyWorkScreenState();
}

class _MyWorkScreenState extends ConsumerState<MyWorkScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  DateTime _selectedDate = DateTime.now();
  int _selectedMonth = DateTime.now().month;
  int _selectedYear = DateTime.now().year;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dailyKey = {'date': DateFormat('yyyy-MM-dd').format(_selectedDate)};
    final monthStart = DateFormat('yyyy-MM-dd').format(DateTime(_selectedYear, _selectedMonth, 1));
    final monthEnd = DateFormat('yyyy-MM-dd').format(DateTime(_selectedYear, _selectedMonth + 1, 0));
    final monthlyKey = {'startDate': monthStart, 'endDate': monthEnd};

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('My Work'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppTheme.primary,
          unselectedLabelColor: AppTheme.textSecondary,
          indicatorColor: AppTheme.primary,
          tabs: const [
            Tab(text: 'Daily'),
            Tab(text: 'Monthly'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // ── DAILY TAB ──
          _DailyTab(
            selectedDate: _selectedDate,
            onDateChanged: (d) => setState(() => _selectedDate = d),
            filtersKey: dailyKey,
          ),

          // ── MONTHLY TAB ──
          _MonthlyTab(
            selectedMonth: _selectedMonth,
            selectedYear: _selectedYear,
            onMonthChanged: (m, y) => setState(() {
              _selectedMonth = m;
              _selectedYear = y;
            }),
            filtersKey: monthlyKey,
          ),
        ],
      ),
    );
  }
}

// ── DAILY TAB ──────────────────────────────────────────────────────────────

class _DailyTab extends ConsumerWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateChanged;
  final Map<String, String?> filtersKey;

  const _DailyTab({
    required this.selectedDate,
    required this.onDateChanged,
    required this.filtersKey,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recordsAsync = ref.watch(workRecordsProvider(filtersKey));

    return Column(
      children: [
        // Date picker bar
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: () => onDateChanged(
                  selectedDate.subtract(const Duration(days: 1)),
                ),
              ),
              Expanded(
                child: GestureDetector(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime.now(),
                      builder: (ctx, child) => Theme(
                        data: Theme.of(ctx).copyWith(
                          colorScheme: const ColorScheme.light(primary: AppTheme.primary),
                        ),
                        child: child!,
                      ),
                    );
                    if (picked != null) onDateChanged(picked);
                  },
                  child: Text(
                    DateFormat('EEEE, MMM d').format(selectedDate),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: selectedDate.day == DateTime.now().day &&
                        selectedDate.month == DateTime.now().month
                    ? null
                    : () => onDateChanged(selectedDate.add(const Duration(days: 1))),
              ),
            ],
          ),
        ),

        Expanded(
          child: recordsAsync.when(
            data: (records) => _RecordsList(records: records),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
        ),
      ],
    );
  }
}

// ── MONTHLY TAB ─────────────────────────────────────────────────────────────

class _MonthlyTab extends ConsumerWidget {
  final int selectedMonth;
  final int selectedYear;
  final void Function(int month, int year) onMonthChanged;
  final Map<String, String?> filtersKey;

  const _MonthlyTab({
    required this.selectedMonth,
    required this.selectedYear,
    required this.onMonthChanged,
    required this.filtersKey,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recordsAsync = ref.watch(workRecordsProvider(filtersKey));

    return Column(
      children: [
        // Month picker bar
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: () {
                  final prev = DateTime(selectedYear, selectedMonth - 1);
                  onMonthChanged(prev.month, prev.year);
                },
              ),
              Text(
                DateFormat('MMMM yyyy').format(DateTime(selectedYear, selectedMonth)),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: () {
                  final next = DateTime(selectedYear, selectedMonth + 1);
                  if (next.isBefore(DateTime.now())) {
                    onMonthChanged(next.month, next.year);
                  }
                },
              ),
            ],
          ),
        ),

        Expanded(
          child: recordsAsync.when(
            data: (records) {
              if (records.isEmpty) {
                return _EmptyState(
                  message: 'No sessions this month',
                  subtitle: DateFormat('MMMM yyyy').format(DateTime(selectedYear, selectedMonth)),
                );
              }
              final totalRevenue = records.fold<double>(0, (s, r) => s + r.amount);
              return Column(
                children: [
                  // Summary card
                  Container(
                    margin: const EdgeInsets.all(16),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.primary, AppTheme.secondary],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        _MiniStat(
                          label: 'Total Revenue',
                          value: '\$${totalRevenue.toStringAsFixed(2)}',
                        ),
                        const SizedBox(width: 16),
                        _MiniStat(
                          label: 'Customers',
                          value: '${records.length}',
                        ),
                        const SizedBox(width: 16),
                        _MiniStat(
                          label: 'Completed',
                          value: '${records.where((r) => !r.isActive).length}',
                        ),
                      ],
                    ),
                  ),
                  Expanded(child: _RecordsList(records: records, showDate: true)),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
        ),
      ],
    );
  }
}

// ── SHARED WIDGETS ──────────────────────────────────────────────────────────

class _RecordsList extends StatelessWidget {
  final List<WorkRecordModel> records;
  final bool showDate;

  const _RecordsList({required this.records, this.showDate = false});

  @override
  Widget build(BuildContext context) {
    if (records.isEmpty) {
      return const _EmptyState(
        message: 'No sessions found',
        subtitle: 'Add a work session to see it here',
      );
    }

    final totalRevenue = records.fold<double>(0, (s, r) => s + r.amount);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Summary row
        Row(
          children: [
            Expanded(
              child: _SummaryChip(
                label: 'Revenue',
                value: '\$${totalRevenue.toStringAsFixed(2)}',
                color: AppTheme.primary,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _SummaryChip(
                label: 'Sessions',
                value: '${records.length}',
                color: AppTheme.secondary,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _SummaryChip(
                label: 'Done',
                value: '${records.where((r) => !r.isActive).length}',
                color: const Color(0xFF10B981),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Records
        ...records.map((r) => _RecordCard(record: r, showDate: showDate)),
      ],
    );
  }
}

class _RecordCard extends StatelessWidget {
  final WorkRecordModel record;
  final bool showDate;
  const _RecordCard({required this.record, this.showDate = false});

  @override
  Widget build(BuildContext context) {
    final timeFmt = DateFormat('HH:mm');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: AppTheme.primary.withOpacity(0.12),
          child: Text(
            record.customerName.isNotEmpty ? record.customerName[0].toUpperCase() : '?',
            style: const TextStyle(
              color: AppTheme.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        title: Text(
          record.customerName,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              record.serviceName,
              style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
            Text(
              showDate
                  ? '${DateFormat('MMM d').format(record.startTime.toLocal())}  ${timeFmt.format(record.startTime.toLocal())}${record.endTime != null ? " – ${timeFmt.format(record.endTime!.toLocal())}" : ""}'
                  : '${timeFmt.format(record.startTime.toLocal())}${record.endTime != null ? " – ${timeFmt.format(record.endTime!.toLocal())}" : ""}',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '\$${record.amount.toStringAsFixed(2)}',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: AppTheme.primary,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: record.isActive
                    ? Colors.orange.shade50
                    : Colors.green.shade50,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                record.isActive ? 'Active' : record.durationText,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: record.isActive
                      ? Colors.orange.shade700
                      : Colors.green.shade700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SummaryChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(value,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value,
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
          Text(label,
              style: const TextStyle(fontSize: 11, color: Colors.white70)),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String message;
  final String subtitle;
  const _EmptyState({required this.message, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.assignment_outlined, size: 56, color: Colors.grey.shade300),
          const SizedBox(height: 12),
          Text(message,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
          const SizedBox(height: 4),
          Text(subtitle,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
        ],
      ),
    );
  }
}
