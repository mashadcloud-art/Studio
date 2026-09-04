import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/supabase/supabase_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/work_record_model.dart';
import '../providers/work_provider.dart';

class AddWorkScreen extends ConsumerStatefulWidget {
  const AddWorkScreen({super.key});

  @override
  ConsumerState<AddWorkScreen> createState() => _AddWorkScreenState();
}

class _AddWorkScreenState extends ConsumerState<AddWorkScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();

  WorkRecordModel? _activeSession;
  List<Map<String, dynamic>> _services = [];
  List<Map<String, dynamic>> _customerResults = [];
  String? _selectedServiceId;
  bool _loading = false;
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _loadServices();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _notesCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadServices() async {
    final data = await supabase
        .from('services')
        .select('id, name, price, duration, category')
        .eq('active', true)
        .order('name');
    if (mounted) setState(() => _services = List<Map<String, dynamic>>.from(data as List));
  }

  Future<void> _searchCustomers(String query) async {
    if (query.length < 2) {
      setState(() => _customerResults = []);
      return;
    }
    setState(() => _searching = true);
    final data = await supabase
        .from('customers')
        .select('id, name, phone')
        .or('name.ilike.%$query%,phone.ilike.%$query%')
        .limit(5);
    if (mounted) {
      setState(() {
        _customerResults = List<Map<String, dynamic>>.from(data as List);
        _searching = false;
      });
    }
  }

  Future<void> _startSession() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedServiceId == null) {
      _showSnack('Please select a service', isError: true);
      return;
    }

    final user = ref.read(currentUserProvider);
    if (user == null) return;

    setState(() => _loading = true);
    try {
      // Find or create customer
      final existingData = await supabase
          .from('customers')
          .select('id')
          .eq('phone', _phoneCtrl.text.trim())
          .maybeSingle();

      String customerId;
      if (existingData != null) {
        customerId = existingData['id'] as String;
      } else {
        final newCustomer = await supabase
            .from('customers')
            .insert({
              'name': _nameCtrl.text.trim(),
              'phone': _phoneCtrl.text.trim(),
            })
            .select('id')
            .single();
        customerId = newCustomer['id'] as String;
      }

      // Create work record
      final record = await supabase
          .from('work_records')
          .insert({
            'staff_id': user.id,
            'customer_id': customerId,
            'service_id': _selectedServiceId,
            'start_time': DateTime.now().toIso8601String(),
            'amount': double.tryParse(_amountCtrl.text) ?? 0,
            'notes': _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
            'date': DateFormat('yyyy-MM-dd').format(DateTime.now()),
          })
          .select('''
            *,
            customers:customer_id ( id, name, phone ),
            services:service_id ( id, name, price )
          ''')
          .single();

      setState(() => _activeSession = WorkRecordModel.fromJson(record));
      _showSnack('Session started!');
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _stopSession() async {
    if (_activeSession == null) return;
    setState(() => _loading = true);
    try {
      await supabase
          .from('work_records')
          .update({'end_time': DateTime.now().toIso8601String()})
          .eq('id', _activeSession!.id);

      _showSnack('Session completed! 🎉');
      setState(() => _activeSession = null);
      _formKey.currentState?.reset();
      _nameCtrl.clear();
      _phoneCtrl.clear();
      _notesCtrl.clear();
      _amountCtrl.clear();
      _selectedServiceId = null;

      // Refresh dashboard
      ref.invalidate(currentUserProvider);
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? Colors.red : AppTheme.primary,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Add Customer Work'),
        backgroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Active Session Card
            if (_activeSession != null) ...[
              _ActiveSessionCard(
                session: _activeSession!,
                onStop: _loading ? null : _stopSession,
                loading: _loading,
              ),
              const SizedBox(height: 16),
            ],

            // New Session Form
            if (_activeSession == null)
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.border),
                ),
                padding: const EdgeInsets.all(20),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'New Session',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Customer name with search
                      Stack(
                        children: [
                          Column(
                            children: [
                              TextFormField(
                                controller: _nameCtrl,
                                decoration: const InputDecoration(
                                  labelText: 'Customer Name',
                                  prefixIcon: Icon(Icons.person_outline, size: 20),
                                ),
                                onChanged: _searchCustomers,
                                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                              ),
                              if (_customerResults.isNotEmpty)
                                Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: AppTheme.border),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.08),
                                        blurRadius: 12,
                                      )
                                    ],
                                  ),
                                  child: Column(
                                    children: _customerResults.map((c) {
                                      return ListTile(
                                        dense: true,
                                        title: Text(c['name'] as String),
                                        subtitle: Text(c['phone'] as String),
                                        onTap: () {
                                          _nameCtrl.text = c['name'] as String;
                                          _phoneCtrl.text = c['phone'] as String;
                                          setState(() => _customerResults = []);
                                        },
                                      );
                                    }).toList(),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _phoneCtrl,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone Number',
                          prefixIcon: Icon(Icons.phone_outlined, size: 20),
                        ),
                        validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                      ),

                      const SizedBox(height: 12),

                      // Service dropdown
                      DropdownButtonFormField<String>(
                        value: _selectedServiceId,
                        decoration: const InputDecoration(
                          labelText: 'Select Service',
                          prefixIcon: Icon(Icons.spa_outlined, size: 20),
                        ),
                        items: _services.map((s) {
                          return DropdownMenuItem<String>(
                            value: s['id'] as String,
                            child: Text(
                              '${s['name']} — \$${(s['price'] as num).toStringAsFixed(2)}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (v) {
                          setState(() => _selectedServiceId = v);
                          if (v != null) {
                            final svc = _services.firstWhere((s) => s['id'] == v);
                            _amountCtrl.text = (svc['price'] as num).toStringAsFixed(2);
                          }
                        },
                        validator: (v) => v == null ? 'Select a service' : null,
                      ),

                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _amountCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Amount (\$)',
                          prefixIcon: Icon(Icons.attach_money, size: 20),
                        ),
                        validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                      ),

                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _notesCtrl,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Notes (optional)',
                          prefixIcon: Icon(Icons.notes_outlined, size: 20),
                          alignLabelWithHint: true,
                        ),
                      ),

                      const SizedBox(height: 20),
                      SizedBox(
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: _loading ? null : _startSession,
                          icon: _loading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.play_arrow_rounded),
                          label: const Text('Start Session'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActiveSessionCard extends StatefulWidget {
  final WorkRecordModel session;
  final VoidCallback? onStop;
  final bool loading;

  const _ActiveSessionCard({
    required this.session,
    this.onStop,
    required this.loading,
  });

  @override
  State<_ActiveSessionCard> createState() => _ActiveSessionCardState();
}

class _ActiveSessionCardState extends State<_ActiveSessionCard> {
  late Duration _elapsed;

  @override
  void initState() {
    super.initState();
    _elapsed = DateTime.now().difference(widget.session.startTime);
    // Update elapsed every second
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() => _elapsed = DateTime.now().difference(widget.session.startTime));
      return mounted;
    });
  }

  String get _elapsedText {
    final h = _elapsed.inHours;
    final m = _elapsed.inMinutes % 60;
    final s = _elapsed.inSeconds % 60;
    if (h > 0) return '${h}h ${m}m ${s}s';
    return '${m}m ${s}s';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF059669), Color(0xFF10B981)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF10B981).withOpacity(0.3),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              const Text(
                'Session in progress',
                style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500),
              ),
              const Spacer(),
              Text(
                _elapsedText,
                style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            widget.session.customerName,
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
          ),
          Text(
            widget.session.serviceName,
            style: const TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 4),
          Text(
            '\$${widget.session.amount.toStringAsFixed(2)}',
            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF059669),
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: widget.onStop,
              icon: widget.loading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF059669)),
                    )
                  : const Icon(Icons.stop_rounded),
              label: const Text('Stop Session', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}
