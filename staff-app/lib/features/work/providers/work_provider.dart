import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/supabase/supabase_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/work_record_model.dart';

final workRecordsProvider = FutureProvider.family<List<WorkRecordModel>, Map<String, String?>>(
  (ref, filters) async {
    final user = ref.watch(currentUserProvider);
    if (user == null) return [];

    var query = supabase
        .from('work_records')
        .select('''
          *,
          customers:customer_id ( id, name, phone ),
          services:service_id ( id, name, price )
        ''')
        .eq('staff_id', user.id)
        .order('created_at', ascending: false);

    if (filters['date'] != null) {
      query = query.eq('date', filters['date']!);
    }
    if (filters['startDate'] != null) {
      query = query.gte('date', filters['startDate']!);
    }
    if (filters['endDate'] != null) {
      query = query.lte('date', filters['endDate']!);
    }

    final data = await query;
    return (data as List).map((r) => WorkRecordModel.fromJson(r)).toList();
  },
);
