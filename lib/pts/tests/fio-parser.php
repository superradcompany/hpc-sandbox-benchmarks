<?php
putenv('PTS_MODE=LIB');
define('PTS_AUTO_LOAD_OBJECTS', true);
define('PTS_TEST_PROFILE_PATH', dirname(__DIR__, 3) . '/packages/schema/src/pts-profiles/');
// Run with PHP + DOM/SimpleXML and the pinned PTS 10.8.4 source directory as argv[1].
require rtrim($argv[1], '/') . '/pts-core/phoronix-test-suite.php';
foreach (['6204MiB/s'=>6204, '11.0GiB/s'=>11264, '10.5GiB/s'=>10752, '7442MiB/s'=>7442, '821KiB/s'=>0.821] as $value=>$expected) {
 $profile = new pts_test_profile('fio-2.1.0');
 $result = new pts_test_result($profile);
 $file=tempnam('/tmp','fio');
 file_put_contents($file, "   READ: bw=$value (861MB/s), 821MiB/s-821MiB/s (861MB/s-861MB/s), io=16.4GiB (17.3GB), run=20002-20002msec\n  read: IOPS=12.3k, BW=891MiB/s (934MB/s)(17.5GiB/20006msec)\n");
 pts_test_result_parser::parse_result($result,$file);
 $values=[];foreach($result->generated_result_buffers ?? [] as $r) $values[$r->test_profile->get_result_scale()]=$r->active->results;
 echo json_encode([$value,$expected,$values]),"\n";
 if (($values['MB/s'][0] ?? null) != $expected || ($values['IOPS'][0] ?? null) != 12300) exit(1);
 unlink($file);
}
