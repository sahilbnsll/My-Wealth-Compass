CREATE POLICY "No direct client access to assumptions" ON public.assumptions FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to goals" ON public.goals FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to holdings" ON public.holdings FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to market data" ON public.market_data FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to planned investments" ON public.planned_investments FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to profile" ON public.profile FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to snapshots" ON public.snapshots FOR ALL TO public USING (false) WITH CHECK (false);