import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';

import '../../../core/supabase/supabase_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../work/models/work_record_model.dart';

class DashboardStats {
  final double todayRevenue;
  final int todayCustomers;
  final double monthlyRevenue;
  final int monthlyCustomers;

  const DashboardStats({
    required this.todayRevenue,
    required this.todayCustomers,
    required this.monthlyRevenue,
    required this.monthlyCustomers,
  });
}

final dashboardStatsProvider = FutureProvider<DashboardStats>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const DashboardStats(todayRevenue: 0, todayCustomers: 0, monthlyRevenue: 0, monthlyCustomers: 0);

  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final monthStart = DateFormat('yyyy-MM-dd').format(
    DateTime(DateTime.now().year, DateTime.now().month, 1),
  );

  // Today's records
  final todayData = await supabase
      .from('work_records')
      .select('amount')
      .eq('staff_id', user.id)
      .eq('date', today);

  final todayRevenue = (todayData as List)
      .fold<double>(0, (sum, r) => sum + (r['amount'] as num).toDouble());

  // Monthly records
  final monthlyData = await supabase
      .from('work_records')
      .select('amount')
      .eq('staff_id', user.id)
      .gte('date', monthStart)
      .lte('date', today);

  final monthlyRevenue = (monthlyData as List)
      .fold<double>(0, (sum, r) => sum + (r['amount'] as num).toDouble());

  return DashboardStats(
    todayRevenue: todayRevenue,
    todayCustomers: (todayData as List).length,
    monthlyRevenue: monthlyRevenue,
    monthlyCustomers: (monthlyData as List).length,
  );
});

final todayRecordsProvider = FutureProvider<List<WorkRecordModel>>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null) return [];

  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final data = await supabase
      .from('work_records')
      .select('''
        *,
        customers:customer_id ( id, name, phone ),
        services:service_id ( id, name, price )
      ''')
      .eq('staff_id', user.id)
      .eq('date', today)
      .order('created_at', ascending: false);

  return (data as List).map((r) => WorkRecordModel.fromJson(r)).toList();
});
